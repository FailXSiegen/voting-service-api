'use strict';

const staticContentRepository = require('../../repository/static-content-repository');
const organizerRepository = require('../../repository/organizer-repository');
const staticPageSlugRepository = require('../../repository/static-page-slug-repository');
const AuthenticationError = require('../../errors/AuthenticationError');
const RecordNotFoundError = require('../../errors/RecordNotFoundError');

/**
 * Resolver for static content operations
 */
const resolvers = {
  Query: {
    /**
     * Get all static content entries
     * @param {Object} _ - Parent resolver
     * @param {Object} __ - Arguments
     * @param {Object} context - Request context
     * @returns {Promise<Array>} All static content entries
     */
    staticContents: async (_, __, context) => {
      try {
        const { user } = context;

        // Check if user is authenticated and has permission for admin view
        if (!user || !user.organizer || !(user.organizer.canEditContent || user.organizer.superAdmin)) {
          // For non-admin users, only return published content
          const result = await staticContentRepository.findAll(true);
          // If no results, return empty array (not null items)
          return result || [];
        }

        // For admins, return all content
        const result = await staticContentRepository.findAll(false);
        return result || [];
      } catch (err) {
        console.error('Error in staticContents resolver:', err);
        // Return empty array in case of error, not null 
        return [];
      }
    },

    /**
     * Get static content entries by page key
     * @param {Object} _ - Parent resolver
     * @param {Object} args - Arguments
     * @param {Object} context - Request context
     * @returns {Promise<Array>} Static content entries for the page
     */
    staticContentsByPage: async (_, { pageKey }, context) => {
      try {
        const { user } = context;
        const publishedOnly = !user || !user.organizer || !(user.organizer.canEditContent || user.organizer.superAdmin);

        const result = await staticContentRepository.findByPageKey(pageKey, publishedOnly);
        return result || [];
      } catch (err) {
        console.error('Error in staticContentsByPage resolver:', err);
        return [];
      }
    },

    /**
     * Get static content by ID
     * @param {Object} _ - Parent resolver
     * @param {Object} args - Arguments
     * @param {Object} context - Request context
     * @returns {Promise<Object>} The static content entry
     */
    staticContent: async (_, { id }, context) => {
      try {
        const { user } = context;

        // Check if user is authenticated and has permission for admin view
        if (!user || !user.organizer || !(user.organizer.canEditContent || user.organizer.superAdmin)) {
          console.warn('User not authorized to access static content management');
          return null;
        }

        const content = await staticContentRepository.findById(id);

        if (!content) {
          console.warn('Static content not found');
          return null;
        }

        return content;
      } catch (err) {
        console.error('Error in staticContent resolver:', err);
        return null;
      }
    },

    /**
     * Get static content by page key and section key
     * @param {Object} _ - Parent resolver
     * @param {Object} args - Arguments
     * @param {Object} context - Request context
     * @returns {Promise<Object>} The static content entry
     */
    staticContentBySection: async (_, { pageKey, sectionKey }, context) => {
      try {
        const { user } = context;
        const publishedOnly = !user || !user.organizer || !(user.organizer.canEditContent || user.organizer.superAdmin);

        const content = await staticContentRepository.findBySection(pageKey, sectionKey, publishedOnly);
        return content;
      } catch (err) {
        console.error('Error in staticContentBySection resolver:', err);
        return null;
      }
    },

    /**
     * Get static content by page slug
     * @param {Object} _ - Parent resolver
     * @param {Object} args - Arguments
     * @param {Object} context - Request context
     * @returns {Promise<Array>} The static content entries for the page
     */
    staticContentByPageSlug: async (_, { pageSlug }, context) => {
      try {
        const { user } = context;
        const publishedOnly = !user || !user.organizer || !(user.organizer.canEditContent || user.organizer.superAdmin);

        // First, find the page key by slug from the mapping table
        const pageSlugEntry = await staticPageSlugRepository.findBySlug(pageSlug);

        if (!pageSlugEntry) {
          console.warn(`No page found with slug: ${pageSlug}`);
          return [];
        }

        // Use the page key to get the content
        const content = await staticContentRepository.findByPageKey(pageSlugEntry.pageKey, publishedOnly);
        return content;
      } catch (err) {
        console.error('Error in staticContentByPageSlug resolver:', err);
        return [];
      }
    },

    /**
     * Get version history for a static content
     * @param {Object} _ - Parent resolver
     * @param {Object} args - Arguments
     * @param {Object} context - Request context
     * @returns {Promise<Array>} Version entries for the content
     */
    staticContentVersions: async (_, { contentId }, context) => {
      try {
        const { user } = context;

        // Check if user is authenticated and has permission for admin view
        if (!user || !user.organizer || !(user.organizer.canEditContent || user.organizer.superAdmin)) {
          console.warn('User not authorized to access static content history');
          return [];
        }

        const result = await staticContentRepository.getVersions(contentId);
        return result || [];
      } catch (err) {
        console.error('Error in staticContentVersions resolver:', err);
        return [];
      }
    }
  },

  Mutation: {
    /**
     * Create a new static content entry
     * @param {Object} _ - Parent resolver
     * @param {Object} args - Arguments
     * @param {Object} context - Request context
     * @returns {Promise<Object>} The created static content entry
     */
    createStaticContent: async (_, { input }, context) => {
      try {
        const { user } = context;

        // Check if user is authenticated and has permission for admin view
        if (!user || !user.organizer || !(user.organizer.canEditContent || user.organizer.superAdmin)) {
          console.warn('User not authorized to create static content');
          return null;
        }

        // Convert input field names from camelCase to snake_case for the repository
        const repositoryInput = {
          pageKey: input.pageKey,
          sectionKey: input.sectionKey,
          contentType: input.contentType || 'standard',
          content: input.content,
          title: input.title,
          headerClass: input.headerClass || 'h2',
          ordering: input.ordering,
          isPublished: input.isPublished
        };

        // Add multi-column data if provided
        if (input.contentType === 'multi-column' && input.columnCount) {
          repositoryInput.columnCount = input.columnCount;

          if (input.columnsContent && Array.isArray(input.columnsContent)) {
            repositoryInput.columnsContent = input.columnsContent;
          }
        }

        // Add accordion data if provided
        if (input.contentType === 'accordion' && input.accordionItems && Array.isArray(input.accordionItems)) {
          repositoryInput.accordionItems = input.accordionItems;
        }

        // Create the content first
        const content = await staticContentRepository.create(repositoryInput, user.organizer.id);

        return content;
      } catch (err) {
        console.error('Error in createStaticContent resolver:', err);
        return null;
      }
    },

    /**
     * Update an existing static content entry
     * @param {Object} _ - Parent resolver
     * @param {Object} args - Arguments
     * @param {Object} context - Request context
     * @returns {Promise<Object>} The updated static content entry
     */
    updateStaticContent: async (_, { input }, context) => {
      try {
        const { user } = context;

        // Check if user is authenticated and has permission for admin view
        if (!user || !user.organizer || !(user.organizer.canEditContent || user.organizer.superAdmin)) {
          console.warn('User not authorized to update static content');
          return null;
        }

        // Get the existing content first to get the page key
        const existingContent = await staticContentRepository.findById(input.id);
        if (!existingContent) {
          throw new RecordNotFoundError('Static content not found');
        }

        // Convert input field names from camelCase to snake_case for the repository
        const repositoryInput = {
          content: input.content,
          title: input.title,
          headerClass: input.headerClass,
          ordering: input.ordering !== undefined ? parseInt(input.ordering, 10) : undefined,
          isPublished: input.isPublished,
          contentType: input.contentType
        };

        // Add multi-column data if provided
        if (input.columnCount !== undefined) {
          repositoryInput.columnCount = input.columnCount;
        }

        if (input.columnsContent !== undefined) {
          repositoryInput.columnsContent = input.columnsContent;
        }

        // Add accordion data if provided
        if (input.accordionItems !== undefined) {
          repositoryInput.accordionItems = input.accordionItems;
        }

        // Update the content
        const updatedContent = await staticContentRepository.update(input.id, repositoryInput, user.organizer.id);

        return updatedContent;
      } catch (err) {
        console.error('Error in updateStaticContent resolver:', err);
        return null;
      }
    },

    /**
     * Delete a static content entry
     * @param {Object} _ - Parent resolver
     * @param {Object} args - Arguments
     * @param {Object} context - Request context
     * @returns {Promise<boolean>} Success of the deletion
     */
    deleteStaticContent: async (_, { id }, context) => {
      try {
        const { user } = context;

        // Check if user is authenticated and has permission for admin view
        if (!user || !user.organizer || !(user.organizer.canEditContent || user.organizer.superAdmin)) {
          console.warn('User not authorized to delete static content');
          return false;
        }

        return staticContentRepository.delete(id);
      } catch (err) {
        console.error('Error in deleteStaticContent resolver:', err);
        return false;
      }
    },

    /**
     * Toggle published state of static content
     * @param {Object} _ - Parent resolver
     * @param {Object} args - Arguments
     * @param {Object} context - Request context
     * @returns {Promise<Object>} The updated static content entry
     */
    toggleStaticContentPublished: async (_, { id, isPublished }, context) => {
      try {
        const { user } = context;

        // Check if user is authenticated and has permission for admin view
        if (!user || !user.organizer || !(user.organizer.canEditContent || user.organizer.superAdmin)) {
          console.warn('User not authorized to publish/unpublish static content');
          return null;
        }

        return staticContentRepository.togglePublished(id, isPublished);
      } catch (err) {
        console.error('Error in toggleStaticContentPublished resolver:', err);
        return null;
      }
    },

    /**
     * Revert content to a previous version
     * @param {Object} _ - Parent resolver
     * @param {Object} args - Arguments
     * @param {Object} context - Request context
     * @returns {Promise<Object>} The updated static content
     */
    revertStaticContentToVersion: async (_, { contentId, versionId }, context) => {
      try {
        const { user } = context;

        // Check if user is authenticated and has permission for admin view
        if (!user || !user.organizer || !(user.organizer.canEditContent || user.organizer.superAdmin)) {
          console.warn('User not authorized to revert static content versions');
          return null;
        }

        return staticContentRepository.revertToVersion(contentId, versionId, user.organizer.id);
      } catch (err) {
        console.error('Error in revertStaticContentToVersion resolver:', err);
        return null;
      }
    }
  },

  StaticContent: {
    /**
     * Resolve createdBy field to Organizer object
     * @param {Object} parent - The static content object
     * @returns {Promise<Object>} The organizer who created the content
     */
    createdBy: async (parent) => {
      // camelCase mapping from database.js means we need to look for camelCase properties
      if (!parent.createdBy) {
        return null;
      }

      return organizerRepository.findById(parent.createdBy);
    },

    /**
     * Resolve versions field to array of versions
     * @param {Object} parent - The static content object
     * @returns {Promise<Array>} The version history for this content
     */
    versions: async (parent) => {
      return staticContentRepository.getVersions(parent.id);
    },

    /**
     * Resolve pageSlug field from the page slugs mapping table
     * @param {Object} parent - The static content object
     * @returns {Promise<string>} The page slug
     */
    pageSlug: async (parent) => {
      if (!parent.pageKey) {
        return null;
      }

      try {
        const pageSlugEntry = await staticPageSlugRepository.findByPageKey(parent.pageKey);
        return pageSlugEntry ? pageSlugEntry.slug : null;
      } catch (err) {
        console.warn(`Error resolving pageSlug for pageKey ${parent.pageKey}:`, err.message);
        return null;
      }
    },

    // The parent already has camelCase fields from database.js
    // Just add default values to ensure non-null fields
    headerClass: (parent) => parent.headerClass || 'h2',
    columnCount: (parent) => parent.columnCount,
    columnsContent: (parent) => parent.columnsContent || [],
    accordionItems: (parent) => parent.accordionItems || []
  },

  StaticContentVersion: {
    /**
     * Resolve changedBy field to Organizer object
     * @param {Object} parent - The version object
     * @returns {Promise<Object>} The organizer who created the version
     */
    changedBy: async (parent) => {
      if (!parent.changedBy) {
        return null;
      }

      return organizerRepository.findById(parent.changedBy);
    },

    /**
     * Resolve pageSlug field from the current state in page slugs mapping table
     * @param {Object} parent - The version object
     * @returns {Promise<string>} The page slug
     */
    pageSlug: async (parent) => {
      // Get the page key from the current content
      const content = await staticContentRepository.findById(parent.contentId);
      if (!content || !content.pageKey) {
        return null;
      }

      try {
        const pageSlugEntry = await staticPageSlugRepository.findByPageKey(content.pageKey);
        return pageSlugEntry ? pageSlugEntry.slug : null;
      } catch (err) {
        console.warn(`Error resolving pageSlug for version of content ID ${parent.contentId}:`, err.message);
        return null;
      }
    },

    // The parent already has camelCase fields from database.js
    // Just add default values to ensure non-null fields
    contentType: (parent) => parent.contentType || 'standard',
    headerClass: (parent) => parent.headerClass || 'h2',
    columnCount: (parent) => parent.columnCount,
    columnsContent: (parent) => parent.columnsContent || [],
    accordionItems: (parent) => parent.accordionItems || []
  }
};

module.exports = resolvers;
const staticPageSlugRepository = require('../../repository/static-page-slug-repository');
const AuthenticationError = require('../../errors/AuthenticationError');
const RecordNotFoundError = require('../../errors/RecordNotFoundError');

/**
 * Resolver for page slug operations
 */
const resolvers = {
  Query: {
    /**
     * Get all page slugs
     * @param {Object} _ - Parent resolver
     * @param {Object} __ - Arguments
     * @param {Object} context - Request context
     * @returns {Promise<Array>} All page slug entries
     */
    pageSlugs: async (_, __, context) => {
      try {
        const { user } = context;

        // Check if user is authenticated and has permission for admin view
        if (!user || !user.organizer || !(user.organizer.canEditContent || user.organizer.superAdmin)) {
          console.warn('User not authorized to access page slugs');
          return [];
        }

        const result = await staticPageSlugRepository.findAll();
        return result || [];
      } catch (err) {
        console.error('Error in pageSlugs resolver:', err);
        return [];
      }
    },

    /**
     * Get page slug by page key
     * @param {Object} _ - Parent resolver
     * @param {Object} args - Arguments
     * @param {Object} context - Request context
     * @returns {Promise<Object>} The page slug entry
     */
    pageSlugByPageKey: async (_, { pageKey }, context) => {
      try {
        return staticPageSlugRepository.findByPageKey(pageKey);
      } catch (err) {
        console.error('Error in pageSlugByPageKey resolver:', err);
        return null;
      }
    },

    /**
     * Get page slug by slug
     * @param {Object} _ - Parent resolver
     * @param {Object} args - Arguments
     * @param {Object} context - Request context
     * @returns {Promise<Object>} The page slug entry
     */
    pageSlugBySlug: async (_, { slug }, context) => {
      try {
        return staticPageSlugRepository.findBySlug(slug);
      } catch (err) {
        console.error('Error in pageSlugBySlug resolver:', err);
        return null;
      }
    }
  },

  Mutation: {
    /**
     * Create or update page slug
     * @param {Object} _ - Parent resolver
     * @param {Object} args - Arguments
     * @param {Object} context - Request context
     * @returns {Promise<Object>} The created or updated page slug entry
     */
    upsertPageSlug: async (_, { pageKey, slug }, context) => {
      try {
        const { user } = context;

        // Check if user is authenticated and has permission for admin view
        if (!user || !user.organizer || !(user.organizer.canEditContent || user.organizer.superAdmin)) {
          console.warn('User not authorized to modify page slugs');
          throw new AuthenticationError('Unauthorized');
        }

        // Check if page slug exists
        const existingSlug = await staticPageSlugRepository.findByPageKey(pageKey);

        if (existingSlug) {
          // Update existing slug
          return staticPageSlugRepository.update(pageKey, { slug });
        } else {
          // Create new slug
          return staticPageSlugRepository.create({ pageKey, slug });
        }
      } catch (err) {
        console.error('Error in upsertPageSlug resolver:', err);
        throw err;
      }
    },

    /**
     * Delete page slug
     * @param {Object} _ - Parent resolver
     * @param {Object} args - Arguments
     * @param {Object} context - Request context
     * @returns {Promise<boolean>} Success of the deletion
     */
    deletePageSlug: async (_, { pageKey }, context) => {
      try {
        const { user } = context;

        // Check if user is authenticated and has permission for admin view
        if (!user || !user.organizer || !(user.organizer.canEditContent || user.organizer.superAdmin)) {
          console.warn('User not authorized to delete page slugs');
          throw new AuthenticationError('Unauthorized');
        }

        return staticPageSlugRepository.delete(pageKey);
      } catch (err) {
        console.error('Error in deletePageSlug resolver:', err);
        throw err;
      }
    }
  }
};

module.exports = resolvers;
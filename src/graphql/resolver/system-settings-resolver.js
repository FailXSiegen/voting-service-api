'use strict';

const SystemSettingsRepository = require('../../repository/system-settings-repository');
const { findOneById } = require('../../repository/organizer-repository');

/**
 * System Settings resolver
 */
module.exports = {
  Query: {
    /**
     * Get the global system settings
     * @returns {Promise<Object>} The system settings object
     */
    systemSettings: async () => {
      try {
        const settings = await SystemSettingsRepository.getSettings();
        return {
          id: settings.id,
          useDirectStaticPaths: settings.useDirectStaticPaths,
          useDbFooterNavigation: settings.useDbFooterNavigation,
          updatedAt: settings.updatedAt ? settings.updatedAt.toISOString() : null
        };
      } catch (err) {
        console.error('Error in systemSettings resolver:', err);
        throw err;
      }
    }
  },
  
  Mutation: {
    /**
     * Update system settings
     * @param {Object} _ Parent resolver
     * @param {Object} param1 Input parameters
     * @param {Object} context GraphQL context with auth data
     * @returns {Promise<Object>} Updated system settings
     */
    updateSystemSettings: async (_, { input }, context) => {
      try {
        // Check if user is authenticated and has super admin rights
        if (!context.user || !context.user.id) {
          throw new Error('Authentication required');
        }
        
        // Get the organizer to check permissions
        const organizer = await findOneById(context.user.id);
        if (!organizer || !organizer.superAdmin) {
          throw new Error('Super admin rights required to update system settings');
        }
        
        const updateData = {};
        
        // Only update fields that were provided
        if (input.useDirectStaticPaths !== undefined) {
          updateData.use_direct_static_paths = input.useDirectStaticPaths;
        }
        
        if (input.useDbFooterNavigation !== undefined) {
          updateData.use_db_footer_navigation = input.useDbFooterNavigation;
        }
        
        const updatedSettings = await SystemSettingsRepository.updateSettings(updateData, context.user.id);
        
        return {
          id: updatedSettings.id,
          useDirectStaticPaths: updatedSettings.useDirectStaticPaths,
          useDbFooterNavigation: updatedSettings.useDbFooterNavigation,
          updatedAt: updatedSettings.updatedAt ? updatedSettings.updatedAt.toISOString() : null
        };
      } catch (err) {
        console.error('Error in updateSystemSettings resolver:', err);
        throw err;
      }
    }
  },
  
  SystemSettings: {
    // Resolve the updatedBy field to get the organizer who last updated the settings
    updatedBy: async (parent) => {
      if (!parent.updatedBy) return null;
      
      try {
        return await findOneById(parent.updatedBy);
      } catch (err) {
        console.error('Error resolving updatedBy in SystemSettings:', err);
        return null;
      }
    }
  }
};
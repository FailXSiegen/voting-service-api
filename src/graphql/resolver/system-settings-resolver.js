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
        // Attempt to get settings
        let settings;
        try {
          settings = await SystemSettingsRepository.getSettings();
        } catch (error) {
          console.error('Failed to get system settings, returning defaults:', error);
          // Return default settings if database query fails
          return {
            id: 0,
            useDirectStaticPaths: false,
            useDbFooterNavigation: false,
            updatedAt: null
          };
        }
        
        // If we got settings, return them
        if (settings) {
          return {
            id: settings.id,
            useDirectStaticPaths: settings.useDirectStaticPaths,
            useDbFooterNavigation: settings.useDbFooterNavigation,
            updatedAt: settings.updatedAt ? new Date(settings.updatedAt).toISOString() : null
          };
        } else {
          // Return default settings if null or undefined
          return {
            id: 0,
            useDirectStaticPaths: false,
            useDbFooterNavigation: false,
            updatedAt: null
          };
        }
      } catch (err) {
        console.error('Error in systemSettings resolver:', err);
        // Don't throw the error, just return default values
        return {
          id: 0,
          useDirectStaticPaths: false,
          useDbFooterNavigation: false,
          updatedAt: null
        };
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
        
        // Try to get the organizer to check permissions
        let organizer = null;
        try {
          organizer = await findOneById(context.user.id);
        } catch (error) {
          console.error('Failed to find organizer:', error);
          throw new Error('Failed to verify user permissions');
        }
        
        if (!organizer || !organizer.superAdmin) {
          throw new Error('Super admin rights required to update system settings');
        }
        
        // Pass camelCase properties directly
        const updateData = {};
        if (input.useDirectStaticPaths !== undefined) {
          updateData.useDirectStaticPaths = input.useDirectStaticPaths;
        }
        if (input.useDbFooterNavigation !== undefined) {
          updateData.useDbFooterNavigation = input.useDbFooterNavigation;
        }
        
        // Attempt to update settings
        let updatedSettings;
        try {
          updatedSettings = await SystemSettingsRepository.updateSettings(updateData, context.user.id);
        } catch (error) {
          console.error('Failed to update system settings:', error);
          // If failed to update, return the current settings instead
          try {
            updatedSettings = await SystemSettingsRepository.getSettings();
          } catch (innerError) {
            console.error('Failed to get settings after update error:', innerError);
            // Return input values if all else fails
            return {
              id: 0,
              useDirectStaticPaths: input.useDirectStaticPaths !== undefined ? input.useDirectStaticPaths : false,
              useDbFooterNavigation: input.useDbFooterNavigation !== undefined ? input.useDbFooterNavigation : false,
              updatedAt: new Date().toISOString()
            };
          }
        }
        
        // Return exact property names that GraphQL schema expects
        return {
          id: updatedSettings.id,
          useDirectStaticPaths: updatedSettings.useDirectStaticPaths,
          useDbFooterNavigation: updatedSettings.useDbFooterNavigation,
          updatedAt: updatedSettings.updatedAt ? new Date(updatedSettings.updatedAt).toISOString() : new Date().toISOString()
        };
      } catch (err) {
        console.error('Error in updateSystemSettings resolver:', err);
        // Return defaults with the requested changes
        return {
          id: 0,
          useDirectStaticPaths: input.useDirectStaticPaths !== undefined ? input.useDirectStaticPaths : false,
          useDbFooterNavigation: input.useDbFooterNavigation !== undefined ? input.useDbFooterNavigation : false,
          updatedAt: new Date().toISOString()
        };
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
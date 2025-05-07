'use strict';

const db = require('../lib/database');

/**
 * Repository for managing system settings
 */
class SystemSettingsRepository {
  /**
   * Get the active system settings
   * @returns {Promise<object>} System settings object
   */
  async getSettings() {
    try {
      // There should be only one settings record
      const queryString = `
        SELECT s.*, o.username as updater_name
        FROM system_settings s
        LEFT JOIN organizer o ON s.updated_by = o.id
        LIMIT 1
      `;
      
      const result = await db.query(queryString);
      
      // If no settings exist, create default settings
      if (!result || result.length === 0) {
        console.log('No system settings found, creating defaults');
        return this.createDefaultSettings();
      }
      
      return result[0];
    } catch (error) {
      console.error('Error fetching system settings:', error);
      throw error;
    }
  }
  
  /**
   * Create default system settings
   * @returns {Promise<object>} Created system settings
   */
  async createDefaultSettings() {
    try {
      const insertResult = await db.insert('system_settings', {
        use_direct_static_paths: false,
        use_db_footer_navigation: false
      }, true);
      
      if (!insertResult || !insertResult.insertId) {
        throw new Error('Failed to insert default system settings');
      }
      
      // Fetch the created settings
      const selectQuery = `
        SELECT s.*, o.username as updater_name
        FROM system_settings s
        LEFT JOIN organizer o ON s.updated_by = o.id
        WHERE s.id = ?
      `;
      
      const result = await db.query(selectQuery, [insertResult.insertId]);
      return result[0];
    } catch (error) {
      console.error('Error creating default system settings:', error);
      throw error;
    }
  }
  
  /**
   * Update system settings
   * @param {Object} data Settings data to update
   * @param {number} organizerId ID of the organizer making the change
   * @returns {Promise<object>} Updated system settings
   */
  async updateSettings(data, organizerId) {
    try {
      // First, make sure the settings exist
      let settings = await this.getSettings();
      
      if (!settings) {
        settings = await this.createDefaultSettings();
      }
      
      const fields = [];
      const params = [];
      
      // Only update fields that were provided
      if (data.use_direct_static_paths !== undefined) {
        fields.push('use_direct_static_paths = ?');
        params.push(data.use_direct_static_paths);
      }
      
      if (data.use_db_footer_navigation !== undefined) {
        fields.push('use_db_footer_navigation = ?');
        params.push(data.use_db_footer_navigation);
      }
      
      // Always update the timestamp and organizer
      fields.push('updated_by = ?');
      params.push(organizerId);
      
      fields.push('updated_at = CURRENT_TIMESTAMP');
      
      // Add the settings ID as the last parameter
      params.push(settings.id);
      
      // Update the settings
      const updateQuery = `
        UPDATE system_settings
        SET ${fields.join(', ')}
        WHERE id = ?
      `;
      
      await db.query(updateQuery, params);
      
      // Fetch the updated settings
      const selectQuery = `
        SELECT s.*, o.username as updater_name
        FROM system_settings s
        LEFT JOIN organizer o ON s.updated_by = o.id
        WHERE s.id = ?
      `;
      
      const result = await db.query(selectQuery, [settings.id]);
      return result[0];
    } catch (error) {
      console.error('Error updating system settings:', error);
      throw error;
    }
  }
}

module.exports = new SystemSettingsRepository();
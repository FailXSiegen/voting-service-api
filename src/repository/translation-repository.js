'use strict';

const fs = require('fs').promises;
const path = require('path');

/**
 * Repository for managing translations
 */
class TranslationRepository {
  constructor() {
    // Base path for messages files
    this.basePath = path.resolve(__dirname, '../../'); 
    this.defaultMessagesPath = path.join(this.basePath, 'src', 'messages.json');
    this.localMessagesPath = path.join(this.basePath, 'src', 'messages.local.json');
  }

  /**
   * Get the complete translations object
   * @returns {Promise<object>} Complete translations object
   */
  async getTranslations() {
    try {
      // Read the default messages file
      const defaultMessagesData = await fs.readFile(this.defaultMessagesPath, 'utf8');
      const defaultMessages = JSON.parse(defaultMessagesData);
      
      // Check if local messages file exists
      let localMessages = {};
      try {
        const localMessagesData = await fs.readFile(this.localMessagesPath, 'utf8');
        localMessages = JSON.parse(localMessagesData);
      } catch (err) {
        console.log('No local messages file found, using only default messages');
      }
      
      // Deep merge the two objects
      return this._deepMerge(defaultMessages, localMessages);
    } catch (err) {
      console.error('Error loading translations:', err);
      throw err;
    }
  }
  
  /**
   * Get translations for a specific locale
   * @param {string} locale The locale to get translations for
   * @returns {Promise<object>} Translations for the specified locale
   */
  async getTranslationsByLocale(locale) {
    const translations = await this.getTranslations();
    return translations[locale] || {};
  }
  
  /**
   * Save translations to messages.local.json
   * @param {Array<Object>} translations Array of translations to save
   * @param {number} organizerId ID of the organizer making the change
   * @returns {Promise<boolean>} Success status
   */
  async saveTranslations(translations, organizerId) {
    try {
      // First load the existing local messages
      let localMessages = {};
      try {
        const localMessagesData = await fs.readFile(this.localMessagesPath, 'utf8');
        localMessages = JSON.parse(localMessagesData);
      } catch (err) {
        console.log('No existing local messages file, creating new one');
      }
      
      // Process each translation and update the localMessages object
      for (const translation of translations) {
        const { locale, key, value } = translation;
        
        // Make sure the locale exists in the object
        if (!localMessages[locale]) {
          localMessages[locale] = {};
        }
        
        // Set the nested value based on the key path
        this._setNestedValue(localMessages[locale], key.split('.'), value);
      }
      
      // Write the updated local messages file
      await fs.writeFile(
        this.localMessagesPath, 
        JSON.stringify(localMessages, null, 2), 
        'utf8'
      );
      
      return true;
    } catch (err) {
      console.error('Error saving translations:', err);
      throw err;
    }
  }
  
  /**
   * Delete a specific translation
   * @param {string} locale The locale of the translation
   * @param {string} key The key of the translation
   * @returns {Promise<boolean>} Success status
   */
  async deleteTranslation(locale, key, organizerId) {
    try {
      // First load the existing local messages
      let localMessages = {};
      try {
        const localMessagesData = await fs.readFile(this.localMessagesPath, 'utf8');
        localMessages = JSON.parse(localMessagesData);
      } catch (err) {
        console.log('No existing local messages file, nothing to delete');
        return false;
      }
      
      // Check if the locale exists
      if (!localMessages[locale]) {
        return false;
      }
      
      // Delete the nested value based on the key path
      const result = this._deleteNestedValue(localMessages[locale], key.split('.'));
      
      // Write the updated local messages file
      await fs.writeFile(
        this.localMessagesPath, 
        JSON.stringify(localMessages, null, 2), 
        'utf8'
      );
      
      return result;
    } catch (err) {
      console.error('Error deleting translation:', err);
      throw err;
    }
  }
  
  /**
   * Helper method to set a nested value in an object
   * @param {object} obj The object to set the value in
   * @param {Array<string>} keys The keys to navigate to the value
   * @param {*} value The value to set
   */
  _setNestedValue(obj, keys, value) {
    if (keys.length === 1) {
      obj[keys[0]] = value;
      return;
    }
    
    const key = keys[0];
    if (!obj[key] || typeof obj[key] !== 'object') {
      obj[key] = {};
    }
    
    this._setNestedValue(obj[key], keys.slice(1), value);
  }
  
  /**
   * Helper method to delete a nested value in an object
   * @param {object} obj The object to delete the value from
   * @param {Array<string>} keys The keys to navigate to the value
   * @returns {boolean} Whether the value was deleted
   */
  _deleteNestedValue(obj, keys) {
    if (keys.length === 1) {
      if (obj.hasOwnProperty(keys[0])) {
        delete obj[keys[0]];
        return true;
      }
      return false;
    }
    
    const key = keys[0];
    if (!obj[key] || typeof obj[key] !== 'object') {
      return false;
    }
    
    return this._deleteNestedValue(obj[key], keys.slice(1));
  }
  
  /**
   * Helper method to deep merge two objects
   * @param {object} target The target object
   * @param {object} source The source object
   * @returns {object} The merged object
   */
  _deepMerge(target, source) {
    const result = { ...target };
    
    Object.keys(source).forEach(key => {
      if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        if (result[key] && typeof result[key] === 'object' && !Array.isArray(result[key])) {
          result[key] = this._deepMerge(result[key], source[key]);
        } else {
          result[key] = { ...source[key] };
        }
      } else {
        result[key] = source[key];
      }
    });
    
    return result;
  }
}

module.exports = new TranslationRepository();
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
    this.clientBasePath = path.resolve(this.basePath, '../voting-service-client-v2');

    // Path to the client's messages.json (original source)
    this.defaultMessagesPath = path.join(this.clientBasePath, 'src', 'messages.json');

    // Path for API's local override messages - handle both dev and production
    // In development: use src/, in production: use persistent uploads directory
    const srcPath = path.join(this.basePath, 'src', 'messages.local.json');
    const productionPath = path.join('/app/uploads', 'messages.local.json'); // Persistent volume
    
    // Check if we're in production (no src directory)
    try {
      const srcDir = path.join(this.basePath, 'src');
      require('fs').accessSync(srcDir, require('fs').constants.F_OK);
      this.localMessagesPath = srcPath; // Development
    } catch (error) {
      this.localMessagesPath = productionPath; // Production - use persistent volume
    }

    // Wir speichern keine Datei mehr im Client-Verzeichnis
    // Nur die API kennt die benutzerdefinierten Übersetzungen
  }

  /**
   * Get the complete translations object
   * @returns {Promise<object>} Complete translations object
   */
  async getTranslations() {
    try {
      // Read the default messages file from client directory
      let defaultMessages = {};
      try {
        const defaultMessagesData = await fs.readFile(this.defaultMessagesPath, 'utf8');
        defaultMessages = JSON.parse(defaultMessagesData);
      } catch (defaultMessagesErr) {
        console.error('TranslationRepository: Error loading default messages from client directory:', defaultMessagesErr.message);
        // Create empty structure if default messages cannot be loaded
        defaultMessages = { de: {}, en: {} };
      }

      // Check if local messages file exists
      let localMessages = {};
      try {
        const localMessagesData = await fs.readFile(this.localMessagesPath, 'utf8');
        localMessages = JSON.parse(localMessagesData);
      } catch (err) {
        console.error('TranslationRepository: No local messages file found, using only default messages');
      }

      // Deep merge the two objects
      const mergedMessages = this._deepMerge(defaultMessages, localMessages);
      return mergedMessages;
    } catch (err) {
      console.error('TranslationRepository: Error loading translations:', err);
      throw err;
    }
  }

  /**
   * Get translations for a specific locale
   * @param {string} locale The locale to get translations for
   * @param {boolean} includeDefaults Whether to include default translations (from messages.json)
   * @returns {Promise<object>} Custom translations or both custom and default for the specified locale
   */
  async getTranslationsByLocale(locale, includeDefaults = false) {
    try {
      // 1. Zuerst laden wir die benutzerdefinierten Übersetzungen
      let localMessages = {};
      try {
        const localMessagesData = await fs.readFile(this.localMessagesPath, 'utf8');
        localMessages = JSON.parse(localMessagesData);
      } catch (err) {
        console.error(`TranslationRepository: No local messages file found for locale ${locale}`);
      }

      // Die benutzerdefinierten Übersetzungen für die angegebene Sprache
      const customTranslations = localMessages[locale] || {};

      // 2. Wenn der Client auch die Standardwerte haben möchte
      if (includeDefaults) {
        // Standard-Übersetzungen laden
        let defaultMessages = {};
        try {
          const defaultMessagesData = await fs.readFile(this.defaultMessagesPath, 'utf8');
          defaultMessages = JSON.parse(defaultMessagesData);
        } catch (defaultMessagesErr) {
          console.error('TranslationRepository: Error loading default messages:', defaultMessagesErr.message);
          return { custom: customTranslations, defaults: {} };
        }

        // Standard-Übersetzungen für die angegebene Sprache
        const defaultTranslations = defaultMessages[locale] || {};

        // Beide Versionen zurückgeben
        return {
          custom: customTranslations,
          defaults: defaultTranslations
        };
      }

      // 3. Ansonsten nur die benutzerdefinierten Übersetzungen zurückgeben
      return customTranslations;
    } catch (err) {
      console.error(`Error getting translations for locale ${locale}:`, err);
      // Return empty object as fallback
      return includeDefaults ? { custom: {}, defaults: {} } : {};
    }
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

      // Wir speichern keine Datei mehr im Client-Verzeichnis
      // Der Client holt sich die Daten über die API

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

      // Wir speichern keine Datei mehr im Client-Verzeichnis
      // Der Client holt sich die Daten über die API

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
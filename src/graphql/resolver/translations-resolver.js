'use strict';

const TranslationRepository = require('../../repository/translation-repository');
const organizerRepository = require('../../repository/organizer-repository');
const AuthenticationError = require('../../errors/AuthenticationError');

/**
 * Resolver for translation operations
 */
const resolvers = {
  Query: {
    /**
     * Get all translations
     * @returns {Promise<string>} All translations as JSON string
     */
    translations: async (_, __, context) => {
      try {
        const translations = await TranslationRepository.getTranslations();
        return JSON.stringify(translations);
      } catch (err) {
        console.error('Error in translations resolver:', err);
        throw err;
      }
    },

    /**
     * Get translations for a specific locale
     * @param {Object} _ Parent resolver
     * @param {Object} args Arguments
     * @returns {Promise<string>} Translations for the locale as JSON string
     */
    translationsByLocale: async (_, { locale, includeDefaults }, context) => {
      try {
        const translations = await TranslationRepository.getTranslationsByLocale(locale, includeDefaults);
        return JSON.stringify(translations);
      } catch (err) {
        console.error('Error in translationsByLocale resolver:', err);
        throw err;
      }
    },
  },

  Mutation: {
    /**
     * Save translations
     * @param {Object} _ Parent resolver
     * @param {Object} args Arguments
     * @param {Object} context Request context
     * @returns {Promise<boolean>} Success status
     */
    saveTranslations: async (_, { translations }, context) => {
      try {
        const { user } = context;

        // Check if user is authenticated and has admin permissions
        if (!user || !user.organizer || !(user.organizer.superAdmin)) {
          console.warn('User not authorized to save translations');
          throw new AuthenticationError('Not authorized to save translations');
        }

        return TranslationRepository.saveTranslations(translations, user.organizer.id);
      } catch (err) {
        console.error('Error in saveTranslations resolver:', err);
        throw err;
      }
    },

    /**
     * Delete a specific translation
     * @param {Object} _ Parent resolver
     * @param {Object} args Arguments
     * @param {Object} context Request context
     * @returns {Promise<boolean>} Success status
     */
    deleteTranslation: async (_, { locale, key }, context) => {
      try {
        const { user } = context;

        // Check if user is authenticated and has admin permissions
        if (!user || !user.organizer || !(user.organizer.superAdmin)) {
          console.warn('User not authorized to delete translations');
          throw new AuthenticationError('Not authorized to delete translations');
        }

        return TranslationRepository.deleteTranslation(locale, key, user.organizer.id);
      } catch (err) {
        console.error('Error in deleteTranslation resolver:', err);
        throw err;
      }
    },
  },
};

module.exports = resolvers;
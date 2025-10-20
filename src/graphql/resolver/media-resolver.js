const mediaRepository = require('../../repository/media/media-repository');
const organizerRepository = require('../../repository/organizer-repository');
const AuthenticationError = require('../../errors/AuthenticationError');
const RecordNotFoundError = require('../../errors/RecordNotFoundError');

/**
 * Resolver für Media Operationen
 */
const resolvers = {
  Query: {
    /**
     * Alle Medien abrufen
     * @param {Object} _ - Parent resolver
     * @param {Object} __ - Arguments
     * @param {Object} context - Request context
     * @returns {Promise<Array>} Liste der Medien
     */
    mediaItems: async (_, __, context) => {
      try {
        const { user } = context;

        // Prüfe Berechtigung (nur Admins können Medien verwalten)
        console.log('User in context:', user ? 'Authenticated' : 'Unauthenticated');
        // Eigenschaften sind im camelCase
        if (!user || !user.organizer || !(user.organizer.canEditContent || user.organizer.superAdmin)) {
          console.warn('Unauthorized access to mediaItems');
          return [];
        }

        console.log('Fetching media items');
        const result = await mediaRepository.findAll(100);
        console.log('Media items found:', result.length, result);
        return result || [];
      } catch (err) {
        console.error('Error in mediaItems resolver:', err);
        return [];
      }
    },

    /**
     * Medium mit bestimmter ID abrufen
     * @param {Object} _ - Parent resolver
     * @param {Object} args - Arguments
     * @param {Object} context - Request context
     * @returns {Promise<Object>} Das Medium
     */
    media: async (_, { id }, context) => {
      try {
        const { user } = context;

        // Prüfe Berechtigung
        if (!user || !user.organizer || !(user.organizer.canEditContent || user.organizer.superAdmin)) {
          console.warn('Unauthorized access to media');
          return null;
        }

        return await mediaRepository.findById(id);
      } catch (err) {
        console.error('Error in media resolver:', err);
        return null;
      }
    }
  },

  Mutation: {
    /**
     * Medium löschen
     * @param {Object} _ - Parent resolver
     * @param {Object} args - Arguments
     * @param {Object} context - Request context
     * @returns {Promise<boolean>} Erfolgsstatus
     */
    deleteMedia: async (_, { id }, context) => {
      try {
        const { user } = context;

        // Prüfe Berechtigung
        if (!user || !user.organizer || !(user.organizer.canEditContent || user.organizer.superAdmin)) {
          throw new AuthenticationError('Not authorized to delete media');
        }

        return await mediaRepository.delete(id);
      } catch (err) {
        console.error('Error in deleteMedia resolver:', err);
        return false;
      }
    }
  },

  Media: {
    /**
     * Auflösen des createdBy-Felds auf ein Organizer-Objekt
     * @param {Object} parent - Das Media-Objekt
     * @returns {Promise<Object>} Der Organizer
     */
    createdBy: async (parent) => {
      if (!parent.createdBy) {
        return null;
      }

      return organizerRepository.findOneById(parent.createdBy);
    },

    /**
     * URL für Client anpassen
     * @param {Object} parent - Das Media-Objekt
     * @returns {string} Die vollständige URL
     */
    url: (parent) => {
      // Stellen sicher, dass die URL korrekt für den Client formatiert ist
      return parent.path;
    },

    /**
     * Zeitstempel formatieren
     * @param {Object} parent - Das Media-Objekt
     * @returns {string} Der formatierte Zeitstempel
     */
    uploadedAt: (parent) => {
      return parent.createdAt;
    },

    /**
     * MIME-Typ direkt zurückgeben
     * @param {Object} parent - Das Media-Objekt
     * @returns {string} Der MIME-Typ
     */
    mimeType: (parent) => {
      return parent.mimeType;
    },

    /**
     * Dateigröße direkt zurückgeben
     * @param {Object} parent - Das Media-Objekt
     * @returns {number} Die Dateigröße
     */
    fileSize: (parent) => {
      return parent.fileSize;
    }
  }
};

module.exports = resolvers;
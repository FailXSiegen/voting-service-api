'use strict';

const db = require('../../lib/database');
const fs = require('fs');
const path = require('path');

/**
 * Repository für die Verwaltung von Medien
 */
class MediaRepository {
  /**
   * Erstellt einen neuen Media-Eintrag
   * @param {Object} data - Die Mediendaten
   * @returns {Promise<Object>} Der erstellte Media-Eintrag
   */
  async create(data) {
    // MariaDB unterstützt nicht RETURNING *, daher müssen wir erst einfügen und dann abfragen
    const insertQuery = `
      INSERT INTO media (
        filename,
        path,
        mime_type,
        file_size,
        created_by
      ) VALUES (?, ?, ?, ?, ?)
    `;
    
    const params = [
      data.filename,
      data.path,
      data.mimeType,
      data.fileSize,
      data.createdBy
    ];
    
    // Erst einfügen
    const insertResult = await db.insert('media', {
      filename: data.filename,
      path: data.path,
      mime_type: data.mimeType,
      file_size: data.fileSize,
      created_by: data.createdBy
    }, true);
    
    if (!insertResult || !insertResult.insertId) {
      throw new Error('Failed to insert media record');
    }
    
    // Dann abholen mit ID
    const selectQuery = `
      SELECT * FROM media WHERE id = ?
    `;
    
    const result = await db.query(selectQuery, [insertResult.insertId]);
    return result[0];
  }
  
  /**
   * Findet alle Medien
   * @param {number} limit - Begrenzung der Anzahl (optional)
   * @returns {Promise<Array>} Liste von Medien
   */
  async findAll(limit = 100) {
    const query = `
      SELECT m.*, o.username as creator_name
      FROM media m
      LEFT JOIN organizer o ON m.created_by = o.id
      ORDER BY m.created_at DESC
      LIMIT ?
    `;
    
    console.log('Running query to fetch all media');
    const result = await db.query(query, [limit]);
    console.log('Query result:', result ? result.length : 0);
    
    if (result && result.length > 0) {
      console.log('First media item sample:', JSON.stringify(result[0]));
    }
    
    return result || [];
  }
  
  /**
   * Findet ein Medium anhand der ID
   * @param {number} id - Die Media-ID
   * @returns {Promise<Object|null>} Das gefundene Medium oder null
   */
  async findById(id) {
    const query = `
      SELECT m.*, o.username as creator_name
      FROM media m
      LEFT JOIN organizer o ON m.created_by = o.id
      WHERE m.id = ?
    `;
    
    const result = await db.query(query, [id]);
    return result[0] || null;
  }
  
  /**
   * Löscht ein Medium
   * @param {number} id - Die Media-ID
   * @returns {Promise<boolean>} Erfolgsstatus
   */
  async delete(id) {
    try {
      // Hole zuerst die Mediendaten
      const media = await this.findById(id);
      
      if (!media) {
        return false;
      }
      
      // Lösche die physische Datei
      const filePath = path.join(
        __dirname, 
        '../../../../voting-service-client-v2/public', 
        media.path
      );
      
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
      // Lösche den Datenbankeintrag
      const query = `
        DELETE FROM media
        WHERE id = ?
      `;
      
      await db.query(query, [id]);
      return true;
    } catch (err) {
      console.error(`Failed to delete media with ID ${id}:`, err);
      return false;
    }
  }
}

module.exports = new MediaRepository();
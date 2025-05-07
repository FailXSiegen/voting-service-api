'use strict';

const db = require('../lib/database');

/**
 * Repository for managing static content
 */
class StaticContentRepository {
  /**
   * Get all static content
   * @param {boolean} publishedOnly - Only return published content
   * @returns {Promise<Array>} All static content entries
   */
  async findAll(publishedOnly = false) {
    let query = `
      SELECT * FROM static_content
    `;
    
    if (publishedOnly) {
      query += ` WHERE is_published = true`;
    }
    
    query += ` ORDER BY page_key, ordering ASC, section_key ASC`;
    
    const result = await db.query(query);
    return result || [];
  }

  /**
   * Get static content by ID
   * @param {number} id - The static content ID
   * @returns {Promise<Object>} The static content entry
   */
  async findById(id) {
    const query = `
      SELECT * FROM static_content
      WHERE id = ?
    `;
    
    const result = await db.query(query, [id]);
    return result[0];
  }

  /**
   * Get static content by page key
   * @param {string} pageKey - The page key
   * @param {boolean} publishedOnly - Only return published content
   * @returns {Promise<Array>} Static content entries for the page
   */
  async findByPageKey(pageKey, publishedOnly = true) {
    let query = `
      SELECT * FROM static_content
      WHERE page_key = ?
    `;
    
    const params = [pageKey];
    
    if (publishedOnly) {
      query += ' AND is_published = true';
    }
    
    query += ' ORDER BY ordering ASC, section_key ASC';
    
    const result = await db.query(query, params);
    return result || [];
  }

  /**
   * Get static content by page key and section key
   * @param {string} pageKey - The page key
   * @param {string} sectionKey - The section key
   * @param {boolean} publishedOnly - Only return published content
   * @returns {Promise<Object>} The static content entry
   */
  async findBySection(pageKey, sectionKey, publishedOnly = true) {
    let query = `
      SELECT * FROM static_content
      WHERE page_key = ? AND section_key = ?
    `;
    
    const params = [pageKey, sectionKey];
    
    if (publishedOnly) {
      query += ' AND is_published = true';
    }
    
    const result = await db.query(query, params);
    return result[0];
  }

  /**
   * Create a new static content entry
   * @param {Object} data - Static content data
   * @param {number} organizerId - ID of the creator
   * @returns {Promise<Object>} The created static content entry
   */
  async create(data, organizerId) {
    // MariaDB does not support RETURNING *, so we need to do a separate query
    const insertResult = await db.insert('static_content', {
      page_key: data.pageKey,
      section_key: data.sectionKey,
      content: data.content,
      title: data.title || null,
      ordering: data.ordering || 0,
      is_published: data.isPublished !== undefined ? data.isPublished : true,
      created_by: organizerId
    }, true);
    
    if (!insertResult || !insertResult.insertId) {
      throw new Error('Failed to insert static content');
    }
    
    // Fetch the created content
    const selectQuery = `
      SELECT * FROM static_content
      WHERE id = ?
    `;
    
    const result = await db.query(selectQuery, [insertResult.insertId]);
    
    try {
      // Create first version entry
      await this.createVersion(result[0].id, result[0].content, result[0].title, 1, organizerId);
    } catch (err) {
      console.warn('Could not create version entry, continuing without versioning:', err.message);
    }
    
    return result[0];
  }

  /**
   * Update an existing static content entry
   * @param {number} id - The static content ID
   * @param {Object} data - Static content data to update
   * @param {number} organizerId - ID of the editor
   * @returns {Promise<Object>} The updated static content entry
   */
  async update(id, data, organizerId) {
    const content = await this.findById(id);
    
    if (!content) {
      throw new Error('Static content not found');
    }
    
    let newVersion = 1;
    try {
      // Get latest version
      const versions = await this.getVersions(id);
      newVersion = versions.length > 0 ? versions[0].version + 1 : 1;
    } catch (err) {
      console.warn('Could not get versions, continuing with version 1:', err.message);
    }
    
    const fields = [];
    const params = [];
    let paramIndex = 1;
    
    if (data.content !== undefined) {
      fields.push(`content = ?`);
      params.push(data.content);
      paramIndex++;
    }
    
    if (data.title !== undefined) {
      fields.push(`title = ?`);
      params.push(data.title);
      paramIndex++;
    }
    
    if (data.ordering !== undefined) {
      fields.push(`ordering = ?`);
      params.push(data.ordering);
      paramIndex++;
    }
    
    if (data.isPublished !== undefined) {
      fields.push(`is_published = ?`);
      params.push(data.isPublished);
      paramIndex++;
      
      if (data.isPublished) {
        fields.push(`published_at = CURRENT_TIMESTAMP`);
      }
    }
    
    fields.push(`updated_at = CURRENT_TIMESTAMP`);
    
    // Add content ID and organizer ID to params
    params.push(id);
    
    // MariaDB does not support RETURNING *, so we need to do a separate query
    const updateQuery = `
      UPDATE static_content
      SET ${fields.join(', ')}
      WHERE id = ?
    `;
    
    await db.query(updateQuery, params);
    
    // Create new version entry if content or title changed
    if (data.content !== undefined || data.title !== undefined) {
      try {
        await this.createVersion(
          id, 
          data.content || content.content,
          data.title !== undefined ? data.title : content.title,
          newVersion, 
          organizerId
        );
      } catch (err) {
        console.warn('Could not create version entry, continuing without versioning:', err.message);
      }
    }
    
    // Fetch the updated content
    const selectQuery = `
      SELECT * FROM static_content
      WHERE id = ?
    `;
    
    const result = await db.query(selectQuery, [id]);
    return result[0];
  }

  /**
   * Delete a static content entry
   * @param {number} id - The static content ID
   * @returns {Promise<boolean>} Success of the deletion
   */
  async delete(id) {
    const query = `
      DELETE FROM static_content
      WHERE id = ?
    `;
    
    await db.query(query, [id]);
    return true;
  }

  /**
   * Toggle published state of static content
   * @param {number} id - The static content ID
   * @param {boolean} isPublished - The new published state
   * @returns {Promise<Object>} The updated static content entry
   */
  async togglePublished(id, isPublished) {
    // MariaDB does not support RETURNING *, so we need to do a separate query
    const updateQuery = `
      UPDATE static_content
      SET 
        is_published = ?,
        ${isPublished ? 'published_at = CURRENT_TIMESTAMP,' : ''}
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `;
    
    await db.query(updateQuery, [isPublished, id]);
    
    // Fetch the updated content
    const selectQuery = `
      SELECT * FROM static_content
      WHERE id = ?
    `;
    
    const result = await db.query(selectQuery, [id]);
    return result[0];
  }

  /**
   * Create a version entry for static content
   * @param {number} contentId - The static content ID
   * @param {string} content - The content text
   * @param {string} title - The content title
   * @param {number} version - The version number
   * @param {number} organizerId - ID of the editor
   * @returns {Promise<Object>} The created version entry
   */
  async createVersion(contentId, content, title, version, organizerId) {
    // MariaDB does not support RETURNING *, so we need to do a separate query
    const insertResult = await db.insert('static_content_version', {
      content_id: contentId,
      content: content,
      title: title,
      version: version,
      changed_by: organizerId
    }, true);
    
    if (!insertResult || !insertResult.insertId) {
      throw new Error('Failed to insert static content version');
    }
    
    // Fetch the created version
    const selectQuery = `
      SELECT * FROM static_content_version
      WHERE id = ?
    `;
    
    const result = await db.query(selectQuery, [insertResult.insertId]);
    return result[0];
  }

  /**
   * Get all versions for a static content entry
   * @param {number} contentId - The static content ID
   * @returns {Promise<Array>} Version entries for the content
   */
  async getVersions(contentId) {
    const query = `
      SELECT * FROM static_content_version
      WHERE content_id = ?
      ORDER BY version DESC
    `;
    
    const result = await db.query(query, [contentId]);
    return result || [];
  }

  /**
   * Get a specific version for a static content entry
   * @param {number} versionId - The version ID
   * @returns {Promise<Object>} The version entry
   */
  async getVersion(versionId) {
    const query = `
      SELECT * FROM static_content_version
      WHERE id = ?
    `;
    
    const result = await db.query(query, [versionId]);
    return result[0];
  }

  /**
   * Revert content to a previous version
   * @param {number} contentId - The static content ID
   * @param {number} versionId - The version ID to revert to
   * @param {number} organizerId - ID of the editor
   * @returns {Promise<Object>} The updated static content
   */
  async revertToVersion(contentId, versionId, organizerId) {
    // Get the version to revert to
    const version = await this.getVersion(versionId);
    
    if (!version || version.content_id !== contentId) {
      throw new Error('Invalid version');
    }
    
    // Update the content
    return this.update(contentId, {
      content: version.content,
      title: version.title
    }, organizerId);
  }
}

module.exports = new StaticContentRepository();
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
    return this.parseContentItems(result || []);
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
    return result[0] ? this.parseContentItem(result[0]) : null;
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
    return this.parseContentItems(result || []);
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
    return result[0] ? this.parseContentItem(result[0]) : null;
  }

  /**
   * Create a new static content entry
   * @param {Object} data - Static content data
   * @param {number} organizerId - ID of the creator
   * @returns {Promise<Object>} The created static content entry
   */
  async create(data, organizerId) {
    // Prepare data for insertion
    const insertData = {
      page_key: data.pageKey,
      section_key: data.sectionKey,
      content_type: data.contentType || 'standard',
      content: data.content,
      title: data.title || null,
      header_class: data.headerClass || 'h2',
      ordering: data.ordering || 0,
      is_published: data.isPublished !== undefined ? data.isPublished : true,
      created_by: organizerId
    };

    // Add column data if provided
    if (data.contentType === 'multi-column' && data.columnCount) {
      insertData.column_count = data.columnCount;

      if (data.columnsContent && Array.isArray(data.columnsContent)) {
        insertData.columns_content = JSON.stringify(data.columnsContent);
      }
    }

    // Add accordion data if provided
    if (data.contentType === 'accordion' && data.accordionItems && Array.isArray(data.accordionItems)) {
      insertData.accordion_items = JSON.stringify(data.accordionItems);
    }

    // MariaDB does not support RETURNING *, so we need to do a separate query
    const insertResult = await db.insert('static_content', insertData, true);

    if (!insertResult || !insertResult.insertId) {
      throw new Error('Failed to insert static content');
    }

    // Fetch the created content
    const selectQuery = `
      SELECT * FROM static_content
      WHERE id = ?
    `;

    const result = await db.query(selectQuery, [insertResult.insertId]);
    const parsedResult = this.parseContentItem(result[0]);

    try {
      // Create first version entry
      await this.createVersion(
        parsedResult.id,
        parsedResult.content,
        parsedResult.title,
        1,
        organizerId,
        parsedResult.contentType,
        parsedResult.columnCount,
        parsedResult.columnsContent,
        parsedResult.accordionItems,
        parsedResult.headerClass
      );
    } catch (err) {
      console.warn('Could not create version entry, continuing without versioning:', err.message);
    }

    return parsedResult;
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

    if (data.content !== undefined) {
      fields.push(`content = ?`);
      params.push(data.content);
    }

    if (data.title !== undefined) {
      fields.push(`title = ?`);
      params.push(data.title);
    }

    if (data.headerClass !== undefined) {
      fields.push(`header_class = ?`);
      params.push(data.headerClass);
    }

    if (data.ordering !== undefined) {
      const orderingValue = parseInt(data.ordering, 10);

      fields.push(`ordering = ?`);
      params.push(orderingValue);

    }

    if (data.isPublished !== undefined) {
      fields.push(`is_published = ?`);
      params.push(data.isPublished);

      if (data.isPublished) {
        fields.push(`published_at = CURRENT_TIMESTAMP`);
      }
    }

    if (data.contentType !== undefined) {
      fields.push(`content_type = ?`);
      params.push(data.contentType);
    }

    if (data.columnCount !== undefined) {
      fields.push(`column_count = ?`);
      params.push(data.columnCount);
    } else if (data.contentType && data.contentType !== 'multi-column') {
      fields.push(`column_count = NULL`);
    }

    if (data.columnsContent !== undefined) {
      fields.push(`columns_content = ?`);
      params.push(Array.isArray(data.columnsContent) ? JSON.stringify(data.columnsContent) : null);
    } else if (data.contentType && data.contentType !== 'multi-column') {
      fields.push(`columns_content = NULL`);
    }

    if (data.accordionItems !== undefined) {
      fields.push(`accordion_items = ?`);
      params.push(Array.isArray(data.accordionItems) ? JSON.stringify(data.accordionItems) : null);
    } else if (data.contentType && data.contentType !== 'accordion') {
      fields.push(`accordion_items = NULL`);
    }

    fields.push(`updated_at = CURRENT_TIMESTAMP`);

    // Add content ID to params
    params.push(id);

    // MariaDB does not support RETURNING *, so we need to do a separate query
    const updateQuery = `
      UPDATE static_content
      SET ${fields.join(', ')}
      WHERE id = ?
    `;

    await db.query(updateQuery, params);

    // Create new version entry if content, title, or other important fields changed
    if (data.content !== undefined || data.title !== undefined || data.headerClass !== undefined ||
      data.contentType !== undefined || data.columnCount !== undefined ||
      data.columnsContent !== undefined || data.accordionItems !== undefined) {
      try {
        const updatedContentType = data.contentType || content.contentType;
        let columnCount = content.columnCount;
        let columnsContent = content.columnsContent;
        let accordionItems = content.accordionItems;
        let headerClass = content.headerClass;

        if (data.columnCount !== undefined) {
          columnCount = data.columnCount;
        }

        if (data.columnsContent !== undefined) {
          columnsContent = data.columnsContent;
        }

        if (data.accordionItems !== undefined) {
          accordionItems = data.accordionItems;
        }

        if (data.headerClass !== undefined) {
          headerClass = data.headerClass;
        }

        await this.createVersion(
          id,
          data.content || content.content,
          data.title !== undefined ? data.title : content.title,
          newVersion,
          organizerId,
          updatedContentType,
          columnCount,
          columnsContent,
          accordionItems,
          headerClass
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
    return this.parseContentItem(result[0]);
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
    return this.parseContentItem(result[0]);
  }

  /**
   * Create a version entry for static content
   * @param {number} contentId - The static content ID
   * @param {string} content - The content text
   * @param {string} title - The content title
   * @param {number} version - The version number
   * @param {number} organizerId - ID of the editor
   * @param {string} contentType - Type of content
   * @param {number} columnCount - Number of columns
   * @param {Array} columnsContent - Content for each column
   * @param {Array} accordionItems - Accordion item data
   * @param {string} headerClass - The header class for styling (h1-h5, d-none)
   * @returns {Promise<Object>} The created version entry
   */
  async createVersion(contentId, content, title, version, organizerId, contentType = 'standard', columnCount = null, columnsContent = null, accordionItems = null, headerClass = 'h2') {
    // Prepare insertion data
    const insertData = {
      content_id: contentId,
      content: content,
      title: title,
      header_class: headerClass,
      version: version,
      changed_by: organizerId,
      content_type: contentType
    };

    if (contentType === 'multi-column' && columnCount) {
      insertData.column_count = columnCount;

      if (columnsContent) {
        insertData.columns_content = Array.isArray(columnsContent)
          ? JSON.stringify(columnsContent)
          : (typeof columnsContent === 'string' ? columnsContent : null);
      }
    }

    if (contentType === 'accordion' && accordionItems) {
      insertData.accordion_items = Array.isArray(accordionItems)
        ? JSON.stringify(accordionItems)
        : (typeof accordionItems === 'string' ? accordionItems : null);
    }

    // MariaDB does not support RETURNING *, so we need to do a separate query
    const insertResult = await db.insert('static_content_version', insertData, true);

    if (!insertResult || !insertResult.insertId) {
      throw new Error('Failed to insert static content version');
    }

    // Fetch the created version
    const selectQuery = `
      SELECT * FROM static_content_version
      WHERE id = ?
    `;

    const result = await db.query(selectQuery, [insertResult.insertId]);
    return this.parseVersionItem(result[0]);
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
    return this.parseVersionItems(result || []);
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
    return result[0] ? this.parseVersionItem(result[0]) : null;
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

    if (!version || version.contentId !== contentId) {
      throw new Error('Invalid version');
    }

    // Update the content
    return this.update(contentId, {
      content: version.content,
      title: version.title,
      headerClass: version.headerClass,
      contentType: version.contentType,
      columnCount: version.columnCount,
      columnsContent: version.columnsContent,
      accordionItems: version.accordionItems
    }, organizerId);
  }

  /**
   * Parse database result for static content items
   * @param {Array} items - Database result array
   * @returns {Array} Parsed static content array
   */
  parseContentItems(items) {
    return items.map(item => this.parseContentItem(item));
  }

  /**
   * Parse database result for static content item
   * @param {Object} item - Database result item
   * @returns {Object} Parsed static content item
   */
  parseContentItem(item) {
    if (!item) return null;

    const parsed = {
      id: item.id || 0,
      pageKey: item.pageKey || '',
      sectionKey: item.sectionKey || '',
      contentType: item.contentType || 'standard',
      content: item.content || '',
      title: item.title || null,
      headerClass: item.headerClass || 'h2',
      ordering: item.ordering || 0,
      isPublished: !!item.isPublished,
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || new Date().toISOString(),
      publishedAt: item.publishedAt || null,
      createdBy: item.createdBy || null
    };

    // Parse column data if it exists
    if (item.columnCount) {
      parsed.columnCount = item.columnCount;
    }

    if (item.columnsContent) {
      try {
        parsed.columnsContent = JSON.parse(item.columnsContent);
      } catch (err) {
        console.warn('Could not parse columns_content JSON:', err.message);
        parsed.columnsContent = [];
      }
    }

    // Parse accordion data if it exists
    if (item.accordionItems) {
      try {
        parsed.accordionItems = JSON.parse(item.accordionItems);
      } catch (err) {
        console.warn('Could not parse accordion_items JSON:', err.message);
        parsed.accordionItems = [];
      }
    }

    return parsed;
  }

  /**
   * Parse database result for static content version items
   * @param {Array} items - Database result array
   * @returns {Array} Parsed static content version array
   */
  parseVersionItems(items) {
    return items.map(item => this.parseVersionItem(item));
  }

  /**
   * Parse database result for static content version item
   * @param {Object} item - Database result item
   * @returns {Object} Parsed static content version item
   */
  parseVersionItem(item) {
    if (!item) return null;

    const parsed = {
      id: item.id || 0,
      contentId: item.contentId || 0,
      content: item.content || '',
      title: item.title || null,
      headerClass: item.headerClass || 'h2',
      version: item.version || 1,
      contentType: item.contentType || 'standard',
      changedBy: item.changedBy || null,
      createdAt: item.createdAt || new Date().toISOString()
    };

    // Parse column data if it exists
    if (item.columnCount) {
      parsed.columnCount = item.columnCount;
    }

    if (item.columnsContent) {
      try {
        parsed.columnsContent = JSON.parse(item.columnsContent);
      } catch (err) {
        console.warn('Could not parse columns_content JSON:', err.message);
        parsed.columnsContent = [];
      }
    }

    // Parse accordion data if it exists
    if (item.accordionItems) {
      try {
        parsed.accordionItems = JSON.parse(item.accordionItems);
      } catch (err) {
        console.warn('Could not parse accordion_items JSON:', err.message);
        parsed.accordionItems = [];
      }
    }

    return parsed;
  }
}

module.exports = new StaticContentRepository();
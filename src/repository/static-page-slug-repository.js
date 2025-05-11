'use strict';

const db = require('../lib/database');

/**
 * Repository for managing static page slugs
 */
class StaticPageSlugRepository {
  /**
   * Get all page slugs
   * @returns {Promise<Array>} All page slug entries
   */
  async findAll() {
    const query = `
      SELECT * FROM static_page_slugs
      ORDER BY page_key ASC
    `;

    const result = await db.query(query);
    return this.parseItems(result || []);
  }

  /**
   * Get page slug by ID
   * @param {number} id - The page slug ID
   * @returns {Promise<Object>} The page slug entry
   */
  async findById(id) {
    const query = `
      SELECT * FROM static_page_slugs
      WHERE id = ?
    `;

    const result = await db.query(query, [id]);
    return result[0] ? this.parseItem(result[0]) : null;
  }

  /**
   * Get page slug by page key
   * @param {string} pageKey - The page key
   * @returns {Promise<Object>} The page slug entry
   */
  async findByPageKey(pageKey) {
    const query = `
      SELECT * FROM static_page_slugs
      WHERE page_key = ?
    `;

    const result = await db.query(query, [pageKey]);
    return result[0] ? this.parseItem(result[0]) : null;
  }

  /**
   * Get page key by slug
   * @param {string} slug - The slug
   * @returns {Promise<Object>} The page slug entry
   */
  async findBySlug(slug) {
    const query = `
      SELECT * FROM static_page_slugs
      WHERE slug = ?
    `;

    const result = await db.query(query, [slug]);
    return result[0] ? this.parseItem(result[0]) : null;
  }

  /**
   * Validate and normalize a slug
   * @param {string} slug - The slug to validate
   * @returns {string} Normalized slug
   */
  validateSlug(slug) {
    if (!slug) return null;

    // Convert to string, lowercase, and replace invalid characters
    let normalizedSlug = String(slug).toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')  // Replace invalid chars with dashes
      .replace(/-+/g, '-')          // Replace multiple dashes with single dash
      .replace(/^-|-$/g, '');       // Remove leading/trailing dashes

    // Check if the slug is too long
    if (normalizedSlug.length > 255) {
      normalizedSlug = normalizedSlug.substring(0, 255);
    }

    return normalizedSlug;
  }

  /**
   * Check if a slug is already in use
   * @param {string} slug - The slug to check
   * @param {string} excludePageKey - Page key to exclude from check (for updates)
   * @returns {Promise<boolean>} Whether the slug is already in use
   */
  async isSlugInUse(slug, excludePageKey = null) {
    if (!slug) return false;

    let query = `
      SELECT id FROM static_page_slugs
      WHERE slug = ?
    `;

    const params = [slug];

    if (excludePageKey) {
      query += ' AND page_key != ?';
      params.push(excludePageKey);
    }

    const result = await db.query(query, params);
    return result.length > 0;
  }

  /**
   * Create a new page slug entry
   * @param {Object} data - Page slug data
   * @returns {Promise<Object>} The created page slug entry
   */
  async create(data) {
    if (!data.pageKey) {
      throw new Error('Page key is required');
    }

    // Process slug
    let slug = null;
    if (data.slug) {
      slug = this.validateSlug(data.slug);
    }

    // If no slug provided, generate from page key
    if (!slug) {
      slug = this.validateSlug(data.pageKey);
    }

    // Check if slug is already in use
    if (await this.isSlugInUse(slug)) {
      throw new Error(`Slug "${slug}" is already in use`);
    }

    // Prepare data for insertion
    const insertData = {
      page_key: data.pageKey,
      slug: slug
    };

    // MariaDB does not support RETURNING *, so we need to do a separate query
    const insertResult = await db.insert('static_page_slugs', insertData, true);

    if (!insertResult || !insertResult.insertId) {
      throw new Error('Failed to insert page slug');
    }

    // Fetch the created entry
    return this.findById(insertResult.insertId);
  }

  /**
   * Create or update a page slug entry
   * @param {string} pageKey - The page key
   * @param {Object} data - Page slug data
   * @returns {Promise<Object>} The created or updated page slug entry
   */
  async upsertPageSlug(pageKey, data) {
    if (!pageKey) {
      throw new Error('Page key is required');
    }

    // Check if an entry already exists for this page key
    const existingEntry = await this.findByPageKey(pageKey);

    if (existingEntry) {
      // Update existing entry
      return this.update(pageKey, data);
    } else {
      // Create new entry
      return this.create({ pageKey, slug: data.slug });
    }
  }

  /**
   * Update an existing page slug entry
   * @param {string} pageKey - The page key
   * @param {Object} data - Page slug data to update
   * @returns {Promise<Object>} The updated page slug entry
   */
  async update(pageKey, data) {
    const entry = await this.findByPageKey(pageKey);

    if (!entry) {
      throw new Error('Page slug entry not found');
    }

    if (!data.slug) {
      throw new Error('Slug is required');
    }

    // Process slug
    const slug = this.validateSlug(data.slug);

    // Check if slug is already in use by another page
    if (await this.isSlugInUse(slug, pageKey)) {
      throw new Error(`Slug "${slug}" is already in use by another page`);
    }

    // MariaDB does not support RETURNING *, so we need to do a separate query
    const updateQuery = `
      UPDATE static_page_slugs
      SET slug = ?, updated_at = CURRENT_TIMESTAMP
      WHERE page_key = ?
    `;

    await db.query(updateQuery, [slug, pageKey]);

    // Fetch the updated entry
    return this.findByPageKey(pageKey);
  }

  /**
   * Delete a page slug entry
   * @param {string} pageKey - The page key
   * @returns {Promise<boolean>} Success of the deletion
   */
  async delete(pageKey) {
    const query = `
      DELETE FROM static_page_slugs
      WHERE page_key = ?
    `;

    await db.query(query, [pageKey]);
    return true;
  }

  /**
   * Parse database result for page slug items
   * @param {Array} items - Database result array
   * @returns {Array} Parsed page slug array
   */
  parseItems(items) {
    return items.map(item => this.parseItem(item));
  }

  /**
   * Parse database result for page slug item
   * @param {Object} item - Database result item
   * @returns {Object} Parsed page slug item
   */
  parseItem(item) {
    if (!item) return null;

    return {
      id: item.id || 0,
      pageKey: item.pageKey || '',
      slug: item.slug || '',
      createdAt: item.createdAt || new Date().toISOString(),
      updatedAt: item.updatedAt || new Date().toISOString()
    };
  }
}

module.exports = new StaticPageSlugRepository();
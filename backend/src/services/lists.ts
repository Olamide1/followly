import { pool } from '../database/connection';
import { createError } from '../middleware/errorHandler';

export interface ListRule {
  field: string;
  operator: 'equals' | 'contains' | 'not_equals' | 'not_contains' | 'greater_than' | 'less_than';
  value: any;
}

export interface SmartListRules {
  operator: 'AND' | 'OR';
  rules: ListRule[];
}

export class ListService {
  async createList(
    userId: number,
    data: {
      name: string;
      type: 'static' | 'smart';
      description?: string;
      rules?: SmartListRules;
    }
  ) {
    const result = await pool.query(
      `INSERT INTO lists (user_id, name, type, description, rules)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        userId,
        data.name,
        data.type,
        data.description,
        data.rules ? JSON.stringify(data.rules) : null,
      ]
    );

    return result.rows[0];
  }

  async getList(userId: number, listId: number) {
    const result = await pool.query(
      'SELECT * FROM lists WHERE id = $1 AND user_id = $2',
      [listId, userId]
    );

    if (result.rows.length === 0) {
      throw createError('List not found', 404);
    }

    const list = result.rows[0];
    if (list.rules) {
      list.rules = typeof list.rules === 'string' ? JSON.parse(list.rules) : list.rules;
    }

    // Get contact count
    if (list.type === 'static') {
      const countResult = await pool.query(
        'SELECT COUNT(*) FROM list_contacts WHERE list_id = $1',
        [listId]
      );
      list.contact_count = parseInt(countResult.rows[0].count);
    } else {
      // Smart list - calculate dynamically
      const contacts = await this.evaluateSmartList(userId, list.rules);
      list.contact_count = contacts.length;
    }

    return list;
  }

  async listLists(userId: number) {
    const result = await pool.query(
      'SELECT * FROM lists WHERE user_id = $1 ORDER BY created_at DESC',
      [userId]
    );

    // Get contact counts
    for (const list of result.rows) {
      if (list.type === 'static') {
        const countResult = await pool.query(
          'SELECT COUNT(*) FROM list_contacts WHERE list_id = $1',
          [list.id]
        );
        list.contact_count = parseInt(countResult.rows[0].count);
      } else if (list.rules) {
        const rules = typeof list.rules === 'string' ? JSON.parse(list.rules) : list.rules;
        const contacts = await this.evaluateSmartList(userId, rules);
        list.contact_count = contacts.length;
      }
    }

    return result.rows;
  }

  async updateList(
    userId: number,
    listId: number,
    data: {
      name?: string;
      description?: string;
      rules?: SmartListRules;
    }
  ) {
    const updates: string[] = [];
    const params: any[] = [];
    let paramCount = 1;

    if (data.name !== undefined) {
      updates.push(`name = $${paramCount++}`);
      params.push(data.name);
    }
    if (data.description !== undefined) {
      updates.push(`description = $${paramCount++}`);
      params.push(data.description);
    }
    if (data.rules !== undefined) {
      updates.push(`rules = $${paramCount++}`);
      params.push(JSON.stringify(data.rules));
    }

    if (updates.length === 0) {
      return this.getList(userId, listId);
    }

    updates.push(`updated_at = CURRENT_TIMESTAMP`);
    params.push(listId, userId);

    await pool.query(
      `UPDATE lists SET ${updates.join(', ')} WHERE id = $${paramCount++} AND user_id = $${paramCount++}`,
      params
    );

    return this.getList(userId, listId);
  }

  async deleteList(userId: number, listId: number) {
    const result = await pool.query(
      'DELETE FROM lists WHERE id = $1 AND user_id = $2 RETURNING id',
      [listId, userId]
    );

    if (result.rows.length === 0) {
      throw createError('List not found', 404);
    }
  }

  async addContactToList(userId: number, listId: number, contactId: number) {
    // Validate all parameters are valid numbers
    if (!Number.isInteger(userId) || userId <= 0) {
      throw createError('Invalid user ID', 400);
    }
    if (!Number.isInteger(listId) || listId <= 0) {
      throw createError('Invalid list ID', 400);
    }
    if (!Number.isInteger(contactId) || contactId <= 0) {
      throw createError('Invalid contact ID', 400);
    }

    // Verify list ownership
    const listResult = await pool.query(
      'SELECT type FROM lists WHERE id = $1 AND user_id = $2',
      [listId, userId]
    );

    if (listResult.rows.length === 0) {
      throw createError('List not found', 404);
    }

    if (listResult.rows[0].type === 'smart') {
      throw createError('Cannot manually add contacts to smart lists', 400);
    }

    // Verify contact ownership
    const contactResult = await pool.query(
      'SELECT id FROM contacts WHERE id = $1 AND user_id = $2',
      [contactId, userId]
    );

    if (contactResult.rows.length === 0) {
      throw createError('Contact not found', 404);
    }

    await pool.query(
      'INSERT INTO list_contacts (list_id, contact_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [listId, contactId]
    );
  }

  async addContactsToList(userId: number, listId: number, contactIds: number[]) {
    // Validate all parameters
    if (!Number.isInteger(userId) || userId <= 0) {
      throw createError('Invalid user ID', 400);
    }
    if (!Number.isInteger(listId) || listId <= 0) {
      throw createError('Invalid list ID', 400);
    }
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      throw createError('Contact IDs are required', 400);
    }

    // Validate all contact IDs are valid integers
    const validContactIds = contactIds.filter(id => {
      return Number.isInteger(id) && id > 0;
    });

    if (validContactIds.length === 0) {
      throw createError('No valid contact IDs provided', 400);
    }

    if (validContactIds.length !== contactIds.length) {
      throw createError('Some contact IDs are invalid', 400);
    }

    // Verify list ownership
    const listResult = await pool.query(
      'SELECT type FROM lists WHERE id = $1 AND user_id = $2',
      [listId, userId]
    );

    if (listResult.rows.length === 0) {
      throw createError('List not found', 404);
    }

    if (listResult.rows[0].type === 'smart') {
      throw createError('Cannot manually add contacts to smart lists', 400);
    }

    // Verify all contacts belong to user
    const contactResult = await pool.query(
      'SELECT id FROM contacts WHERE id = ANY($1) AND user_id = $2',
      [validContactIds, userId]
    );

    if (contactResult.rows.length !== validContactIds.length) {
      throw createError('Some contacts not found or do not belong to you', 400);
    }

    // Bulk insert contacts
    const values = validContactIds.map((_, index) => {
      const base = index * 2;
      return `($${base + 1}, $${base + 2})`;
    }).join(', ');

    const params: any[] = [];
    validContactIds.forEach(id => {
      params.push(listId, id);
    });

    await pool.query(
      `INSERT INTO list_contacts (list_id, contact_id) VALUES ${values} ON CONFLICT DO NOTHING`,
      params
    );

    return {
      added: validContactIds.length,
    };
  }

  async removeContactFromList(_userId: number, listId: number, contactId: number) {
    await pool.query(
      'DELETE FROM list_contacts WHERE list_id = $1 AND contact_id = $2',
      [listId, contactId]
    );
  }

  async getListContacts(userId: number, listId: number, options: {
    page?: number;
    limit?: number;
  } = {}) {
    // Verify ownership
    const listResult = await pool.query(
      'SELECT type, rules FROM lists WHERE id = $1 AND user_id = $2',
      [listId, userId]
    );

    if (listResult.rows.length === 0) {
      throw createError('List not found', 404);
    }

    const list = listResult.rows[0];
    let contactIds: number[];

    if (list.type === 'static') {
      const result = await pool.query(
        'SELECT contact_id FROM list_contacts WHERE list_id = $1',
        [listId]
      );
      contactIds = result.rows.map((r: any) => r.contact_id);
    } else {
      // Smart list
      const rules = typeof list.rules === 'string' ? JSON.parse(list.rules) : list.rules;
      const contacts = await this.evaluateSmartList(userId, rules);
      contactIds = contacts.map((c: any) => c.id);
    }

    if (contactIds.length === 0) {
      return {
        contacts: [],
        pagination: { page: 1, limit: options.limit || 50, total: 0, totalPages: 0 },
      };
    }

    const page = options.page || 1;
    const limit = options.limit || 50;
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT * FROM contacts 
       WHERE id = ANY($1) AND user_id = $2
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [contactIds, userId, limit, offset]
    );

    return {
      contacts: result.rows,
      pagination: {
        page,
        limit,
        total: contactIds.length,
        totalPages: Math.ceil(contactIds.length / limit),
      },
    };
  }

  // Get ALL contacts from a list without pagination (for campaigns)
  async getAllListContacts(userId: number, listId: number): Promise<any[]> {
    // Verify ownership
    const listResult = await pool.query(
      'SELECT type, rules FROM lists WHERE id = $1 AND user_id = $2',
      [listId, userId]
    );

    if (listResult.rows.length === 0) {
      throw createError('List not found', 404);
    }

    const list = listResult.rows[0];
    let contactIds: number[];

    if (list.type === 'static') {
      const result = await pool.query(
        'SELECT contact_id FROM list_contacts WHERE list_id = $1',
        [listId]
      );
      contactIds = result.rows.map((r: any) => r.contact_id);
    } else {
      // Smart list
      const rules = typeof list.rules === 'string' ? JSON.parse(list.rules) : list.rules;
      const contacts = await this.evaluateSmartList(userId, rules);
      contactIds = contacts.map((c: any) => c.id);
    }

    if (contactIds.length === 0) {
      return [];
    }

    // Get all contacts without pagination
    const result = await pool.query(
      `SELECT * FROM contacts 
       WHERE id = ANY($1) AND user_id = $2
       ORDER BY created_at DESC`,
      [contactIds, userId]
    );

    return result.rows;
  }

  // Preview contacts matching rules without saving (for smart list preview)
  async previewListContacts(userId: number, listId: number, rules: SmartListRules, options: {
    page?: number;
    limit?: number;
  } = {}) {
    // Verify ownership (but don't require list to be smart type - allows previewing rules)
    const listResult = await pool.query(
      'SELECT id FROM lists WHERE id = $1 AND user_id = $2',
      [listId, userId]
    );

    if (listResult.rows.length === 0) {
      throw createError('List not found', 404);
    }

    // Evaluate rules without saving
    const contacts = await this.evaluateSmartList(userId, rules);
    const contactIds = contacts.map((c: any) => c.id);

    if (contactIds.length === 0) {
      return {
        contacts: [],
        pagination: { page: 1, limit: options.limit || 50, total: 0, totalPages: 0 },
      };
    }

    const page = options.page || 1;
    const limit = options.limit || 50;
    const offset = (page - 1) * limit;

    const result = await pool.query(
      `SELECT * FROM contacts 
       WHERE id = ANY($1) AND user_id = $2
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [contactIds, userId, limit, offset]
    );

    return {
      contacts: result.rows,
      pagination: {
        page,
        limit,
        total: contactIds.length,
        totalPages: Math.ceil(contactIds.length / limit),
      },
    };
  }

  // Helper function to validate email format
  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email.trim());
  }

  // Import contacts from CSV and add them to a list
  async importContactsFromCSV(
    userId: number,
    listId: number,
    contacts: Array<{
      email: string;
      name?: string;
      company?: string;
      role?: string;
      country?: string;
      subscription_status?: string;
    }>
  ): Promise<{
    imported: number;
    added: number;
    updated: number;
    alreadyInList: number;
    failed: number;
    skipped: number;
    errors: string[];
  }> {
    const client = await pool.connect();
    const errors: string[] = [];
    let imported = 0;
    let updated = 0;
    let added = 0;
    let failed = 0;
    let skipped = 0;
    let alreadyInList = 0;
    const contactIds: number[] = [];

    try {
      await client.query('BEGIN');

      // Verify list ownership and type
      const listResult = await client.query(
        'SELECT type FROM lists WHERE id = $1 AND user_id = $2',
        [listId, userId]
      );

      if (listResult.rows.length === 0) {
        throw createError('List not found', 404);
      }

      if (listResult.rows[0].type === 'smart') {
        throw createError('Cannot manually add contacts to smart lists', 400);
      }

      // Check which contacts are already in the list (for reporting)
      const existingListContacts = await client.query(
        `SELECT c.id, c.email 
         FROM contacts c
         INNER JOIN list_contacts lc ON c.id = lc.contact_id
         WHERE lc.list_id = $1 AND c.user_id = $2`,
        [listId, userId]
      );
      const listContactIds = new Set(existingListContacts.rows.map((r: any) => r.id));

      // Deduplicate contacts by email (keep first occurrence, skip duplicates)
      const uniqueContacts: Array<{
        email: string;
        name?: string;
        company?: string;
        role?: string;
        country?: string;
        subscription_status?: string;
        isDuplicate?: boolean;
      }> = [];
      const processedEmails = new Set<string>();

      for (const contactData of contacts) {
        const normalizedEmail = contactData.email.toLowerCase().trim();
        
        // Validate email format
        if (!this.isValidEmail(normalizedEmail)) {
          failed++;
          errors.push(`${contactData.email}: Invalid email format`);
          continue;
        }

        // Skip duplicates within CSV (keep first occurrence)
        if (processedEmails.has(normalizedEmail)) {
          skipped++;
          continue;
        }
        processedEmails.add(normalizedEmail);
        uniqueContacts.push(contactData);
      }

      // Import/update contacts and collect IDs
      for (const contactData of uniqueContacts) {
        try {
          const normalizedEmail = contactData.email.toLowerCase().trim();
          
          // Check if contact exists
          const existing = await client.query(
            'SELECT id FROM contacts WHERE user_id = $1 AND email = $2',
            [userId, normalizedEmail]
          );

          let contactId: number;
          let wasAlreadyInList = false;

          if (existing.rows.length > 0) {
            // Update existing contact
            contactId = existing.rows[0].id;
            
            // Check if already in list
            if (listContactIds.has(contactId)) {
              alreadyInList++;
              wasAlreadyInList = true;
            }
            
            // Update contact fields (only non-empty values)
            const updates: string[] = [];
            const params: any[] = [];
            let paramCount = 1;

            if (contactData.name !== undefined && contactData.name.trim()) {
              updates.push(`name = $${paramCount++}`);
              params.push(contactData.name.trim());
            }
            if (contactData.company !== undefined && contactData.company.trim()) {
              updates.push(`company = $${paramCount++}`);
              params.push(contactData.company.trim());
            }
            if (contactData.role !== undefined && contactData.role.trim()) {
              updates.push(`role = $${paramCount++}`);
              params.push(contactData.role.trim());
            }
            if (contactData.country !== undefined && contactData.country.trim()) {
              updates.push(`country = $${paramCount++}`);
              params.push(contactData.country.trim());
            }
            if (contactData.subscription_status !== undefined) {
              updates.push(`subscription_status = $${paramCount++}`);
              params.push(contactData.subscription_status);
            }

            if (updates.length > 0) {
              updates.push(`updated_at = CURRENT_TIMESTAMP`);
              params.push(contactId, userId);
              await client.query(
                `UPDATE contacts SET ${updates.join(', ')} WHERE id = $${paramCount++} AND user_id = $${paramCount++}`,
                params
              );
              updated++;
            } else {
              updated++;
            }
          } else {
            // Create new contact
            const result = await client.query(
              `INSERT INTO contacts 
               (user_id, email, name, company, role, country, subscription_status)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               RETURNING id`,
              [
                userId,
                normalizedEmail,
                contactData.name?.trim() || null,
                contactData.company?.trim() || null,
                contactData.role?.trim() || null,
                contactData.country?.trim() || null,
                contactData.subscription_status || 'subscribed',
              ]
            );
            contactId = result.rows[0].id;
            added++;
          }

          // Only add to contactIds if not already in list
          if (!wasAlreadyInList) {
            contactIds.push(contactId);
          }
          imported++;
        } catch (error: any) {
          failed++;
          errors.push(`${contactData.email}: ${error.message}`);
        }
      }

      // Add all successfully imported contacts to the list (with conflict handling)
      if (contactIds.length > 0) {
        // Check which ones are actually new vs already in list
        const values = contactIds.map((_, index) => {
          const base = index * 2;
          return `($${base + 1}, $${base + 2})`;
        }).join(', ');

        const params: any[] = [];
        contactIds.forEach(id => {
          params.push(listId, id);
        });

        await client.query(
          `INSERT INTO list_contacts (list_id, contact_id) VALUES ${values} ON CONFLICT DO NOTHING`,
          params
        );
      }

      await client.query('COMMIT');
    } catch (error: any) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return {
      imported,
      added,
      updated,
      alreadyInList,
      failed,
      skipped,
      errors,
    };
  }

  private async evaluateSmartList(userId: number, rules: SmartListRules): Promise<any[]> {
    if (!rules || !rules.rules || rules.rules.length === 0) {
      return [];
    }

    let query = 'SELECT DISTINCT c.* FROM contacts c WHERE c.user_id = $1';
    const params: any[] = [userId];
    let paramCount = 1;

    const conditions: string[] = [];

    for (const rule of rules.rules) {
      const condition = this.buildRuleCondition(rule, paramCount, params);
      if (condition) {
        conditions.push(condition);
        paramCount += condition.match(/\$\d+/g)?.length || 0;
      }
    }

    if (conditions.length > 0) {
      const operator = rules.operator === 'OR' ? ' OR ' : ' AND ';
      query += ` AND (${conditions.join(operator)})`;
    }

    const result = await pool.query(query, params);
    return result.rows;
  }

  private buildRuleCondition(rule: ListRule, paramStart: number, params: any[]): string | null {
    let paramCount = paramStart;

    switch (rule.field) {
      case 'email':
      case 'name':
      case 'company':
      case 'role':
      case 'country':
        if (rule.operator === 'equals') {
          params.push(rule.value);
          return `c.${rule.field} = $${paramCount++}`;
        } else if (rule.operator === 'contains') {
          params.push(`%${rule.value}%`);
          return `c.${rule.field} ILIKE $${paramCount++}`;
        } else if (rule.operator === 'not_equals') {
          params.push(rule.value);
          return `c.${rule.field} != $${paramCount++}`;
        } else if (rule.operator === 'not_contains') {
          params.push(`%${rule.value}%`);
          return `c.${rule.field} NOT ILIKE $${paramCount++}`;
        }
        break;

      case 'subscription_status':
        params.push(rule.value);
        return `c.subscription_status = $${paramCount++}`;

      case 'tag':
        // Join with tags
        params.push(rule.value);
        return `c.id IN (
          SELECT ct.contact_id FROM contact_tags ct
          INNER JOIN tags t ON ct.tag_id = t.id
          WHERE t.name = $${paramCount++} AND t.user_id = $1
        )`;

      case 'signup_date':
        // Date comparison
        if (rule.operator === 'greater_than') {
          params.push(rule.value);
          return `c.created_at > $${paramCount++}`;
        } else if (rule.operator === 'less_than') {
          params.push(rule.value);
          return `c.created_at < $${paramCount++}`;
        }
        break;
      default:
        break;
    }

    return null;
  }
}


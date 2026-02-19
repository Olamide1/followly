import { pool } from '../database/connection';
import { createError } from '../middleware/errorHandler';

export interface ContactData {
  email: string;
  name?: string;
  company?: string;
  role?: string;
  country?: string;
  subscription_status?: string;
  tags?: number[];
  customFields?: Record<string, string>;
}

export class ContactService {
  async createContact(userId: number, data: ContactData, teamUserIds?: number[]) {
    const ownershipIds = teamUserIds || [userId];
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Check if contact already exists within the team
      const existing = await client.query(
        'SELECT id FROM contacts WHERE user_id = ANY($1::int[]) AND email = $2',
        [ownershipIds, data.email.toLowerCase()]
      );

      if (existing.rows.length > 0) {
        throw createError('Contact already exists', 400);
      }

      // Create contact
      const result = await client.query(
        `INSERT INTO contacts
         (user_id, email, name, company, role, country, subscription_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [
          userId,
          data.email.toLowerCase(),
          data.name,
          data.company,
          data.role,
          data.country,
          data.subscription_status || 'subscribed',
        ]
      );

      const contact = result.rows[0];

      // Add tags
      if (data.tags && data.tags.length > 0) {
        for (const tagId of data.tags) {
          await client.query(
            'INSERT INTO contact_tags (contact_id, tag_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
            [contact.id, tagId]
          );
        }
      }

      // Add custom fields
      if (data.customFields) {
        for (const [fieldName, fieldValue] of Object.entries(data.customFields)) {
          await client.query(
            `INSERT INTO custom_fields (user_id, contact_id, field_name, field_value)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT DO NOTHING`,
            [userId, contact.id, fieldName, fieldValue]
          );
        }
      }

      await client.query('COMMIT');
      return contact;
    } catch (error: any) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getContact(userIds: number[], contactId: number) {
    const result = await pool.query(
      'SELECT * FROM contacts WHERE id = $1 AND user_id = ANY($2::int[])',
      [contactId, userIds]
    );

    if (result.rows.length === 0) {
      throw createError('Contact not found', 404);
    }

    const contact = result.rows[0];

    // Get tags
    const tagsResult = await pool.query(
      `SELECT t.* FROM tags t
       INNER JOIN contact_tags ct ON t.id = ct.tag_id
       WHERE ct.contact_id = $1`,
      [contactId]
    );
    contact.tags = tagsResult.rows;

    // Get custom fields
    const fieldsResult = await pool.query(
      'SELECT field_name, field_value FROM custom_fields WHERE contact_id = $1',
      [contactId]
    );
    contact.customFields = fieldsResult.rows.reduce((acc: Record<string, string>, row: any) => {
      acc[row.field_name] = row.field_value;
      return acc;
    }, {});

    return contact;
  }

  async listContacts(
    userIds: number[],
    options: {
      page?: number;
      limit?: number;
      search?: string;
      tags?: number[];
      subscription_status?: string;
    } = {}
  ) {
    const page = options.page || 1;
    const limit = options.limit || 50;
    const offset = (page - 1) * limit;

    let query = 'SELECT * FROM contacts WHERE user_id = ANY($1::int[])';
    const params: any[] = [userIds];
    let paramCount = 1;

    if (options.search) {
      paramCount++;
      query += ` AND (email ILIKE $${paramCount} OR name ILIKE $${paramCount} OR company ILIKE $${paramCount})`;
      params.push(`%${options.search}%`);
    }

    if (options.subscription_status) {
      paramCount++;
      query += ` AND subscription_status = $${paramCount}`;
      params.push(options.subscription_status);
    }

    if (options.tags && options.tags.length > 0) {
      query += ` AND id IN (
        SELECT contact_id FROM contact_tags WHERE tag_id = ANY($${paramCount + 1})
      )`;
      params.push(options.tags);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
    params.push(limit, offset);

    const result = await pool.query(query, params);

    // Get total count - build count query separately for reliability
    let countQuery = 'SELECT COUNT(*) as count FROM contacts WHERE user_id = ANY($1::int[])';
    const countParams: any[] = [userIds];
    let countParamCount = 1;

    if (options.search) {
      countParamCount++;
      countQuery += ` AND (email ILIKE $${countParamCount} OR name ILIKE $${countParamCount} OR company ILIKE $${countParamCount})`;
      countParams.push(`%${options.search}%`);
    }

    if (options.subscription_status) {
      countParamCount++;
      countQuery += ` AND subscription_status = $${countParamCount}`;
      countParams.push(options.subscription_status);
    }

    if (options.tags && options.tags.length > 0) {
      countQuery += ` AND id IN (
        SELECT contact_id FROM contact_tags WHERE tag_id = ANY($${countParamCount + 1})
      )`;
      countParams.push(options.tags);
    }

    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0].count);

    return {
      contacts: result.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async updateContact(userIds: number[], contactId: number, data: Partial<ContactData>) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Verify ownership
      const existing = await client.query(
        'SELECT id, user_id FROM contacts WHERE id = $1 AND user_id = ANY($2::int[])',
        [contactId, userIds]
      );

      if (existing.rows.length === 0) {
        throw createError('Contact not found', 404);
      }

      const contactOwnerId = existing.rows[0].user_id;

      // Update contact
      const updates: string[] = [];
      const params: any[] = [];
      let paramCount = 1;

      if (data.name !== undefined) {
        updates.push(`name = $${paramCount++}`);
        params.push(data.name);
      }
      if (data.company !== undefined) {
        updates.push(`company = $${paramCount++}`);
        params.push(data.company);
      }
      if (data.role !== undefined) {
        updates.push(`role = $${paramCount++}`);
        params.push(data.role);
      }
      if (data.country !== undefined) {
        updates.push(`country = $${paramCount++}`);
        params.push(data.country);
      }
      if (data.subscription_status !== undefined) {
        updates.push(`subscription_status = $${paramCount++}`);
        params.push(data.subscription_status);
      }

      if (updates.length > 0) {
        updates.push(`updated_at = CURRENT_TIMESTAMP`);
        params.push(contactId);
        await client.query(
          `UPDATE contacts SET ${updates.join(', ')} WHERE id = $${paramCount++}`,
          params
        );
      }

      // Update tags if provided
      if (data.tags !== undefined) {
        await client.query('DELETE FROM contact_tags WHERE contact_id = $1', [contactId]);
        for (const tagId of data.tags) {
          await client.query(
            'INSERT INTO contact_tags (contact_id, tag_id) VALUES ($1, $2)',
            [contactId, tagId]
          );
        }
      }

      // Update custom fields if provided
      if (data.customFields !== undefined) {
        await client.query('DELETE FROM custom_fields WHERE contact_id = $1', [contactId]);
        for (const [fieldName, fieldValue] of Object.entries(data.customFields)) {
          await client.query(
            `INSERT INTO custom_fields (user_id, contact_id, field_name, field_value)
             VALUES ($1, $2, $3, $4)`,
            [contactOwnerId, contactId, fieldName, fieldValue]
          );
        }
      }

      await client.query('COMMIT');

      return this.getContact(userIds, contactId);
    } catch (error: any) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async deleteContact(userIds: number[], contactId: number) {
    const result = await pool.query(
      'DELETE FROM contacts WHERE id = $1 AND user_id = ANY($2::int[]) RETURNING id',
      [contactId, userIds]
    );

    if (result.rows.length === 0) {
      throw createError('Contact not found', 404);
    }
  }

  async deleteContacts(userIds: number[], contactIds: number[]) {
    if (contactIds.length === 0) {
      throw createError('No contact IDs provided', 400);
    }

    const result = await pool.query(
      'DELETE FROM contacts WHERE id = ANY($1) AND user_id = ANY($2::int[]) RETURNING id',
      [contactIds, userIds]
    );

    return {
      deleted: result.rows.length,
      requested: contactIds.length,
    };
  }

  async getContactLists(userIds: number[], contactId: number) {
    const result = await pool.query(
      `SELECT l.id, l.name, l.type, l.description
       FROM lists l
       INNER JOIN list_contacts lc ON l.id = lc.list_id
       WHERE lc.contact_id = $1 AND l.user_id = ANY($2::int[])
       ORDER BY l.name ASC`,
      [contactId, userIds]
    );

    return result.rows;
  }

  async getContactListsBatch(userIds: number[], contactIds: number[]): Promise<Record<number, any[]>> {
    if (contactIds.length === 0) {
      return {};
    }

    // Get all lists for all contacts in a single query
    const result = await pool.query(
      `SELECT lc.contact_id, l.id, l.name, l.type, l.description
       FROM lists l
       INNER JOIN list_contacts lc ON l.id = lc.list_id
       WHERE lc.contact_id = ANY($1) AND l.user_id = ANY($2::int[])
       ORDER BY lc.contact_id, l.name ASC`,
      [contactIds, userIds]
    );

    // Group by contact_id
    const listsByContact: Record<number, any[]> = {};
    for (const row of result.rows) {
      const contactId = row.contact_id;
      if (!listsByContact[contactId]) {
        listsByContact[contactId] = [];
      }
      listsByContact[contactId].push({
        id: row.id,
        name: row.name,
        type: row.type,
        description: row.description,
      });
    }

    // Ensure all contact IDs have an array (even if empty)
    for (const contactId of contactIds) {
      if (!listsByContact[contactId]) {
        listsByContact[contactId] = [];
      }
    }

    return listsByContact;
  }

  async importContacts(userId: number, contacts: ContactData[], teamUserIds?: number[]): Promise<{
    success: number;
    failed: number;
    errors: string[];
  }> {
    const ownershipIds = teamUserIds || [userId];
    const client = await pool.connect();
    const errors: string[] = [];
    let success = 0;
    let failed = 0;

    try {
      await client.query('BEGIN');

      for (const contactData of contacts) {
        try {
          // Check if exists within team
          const existing = await client.query(
            'SELECT id FROM contacts WHERE user_id = ANY($1::int[]) AND email = $2',
            [ownershipIds, contactData.email.toLowerCase()]
          );

          if (existing.rows.length > 0) {
            // Update existing
            await this.updateContact(ownershipIds, existing.rows[0].id, contactData);
          } else {
            // Create new
            await this.createContact(userId, contactData, ownershipIds);
          }
          success++;
        } catch (error: any) {
          failed++;
          errors.push(`${contactData.email}: ${error.message}`);
        }
      }

      await client.query('COMMIT');
    } catch (error: any) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return { success, failed, errors };
  }
}

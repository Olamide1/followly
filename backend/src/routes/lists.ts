import { Router, Response, NextFunction } from 'express';
import { ListService } from '../services/lists';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';
import { parse } from 'csv-parse/sync';
import { mapContactFields } from './contacts';

const router = Router();
router.use(authenticateToken);

// Create list
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const service = new ListService();
    const list = await service.createList(req.userId!, req.body);
    res.status(201).json({ list });
  } catch (error: any) {
    next(error);
  }
});

// Get list
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const service = new ListService();
    const list = await service.getList(req.userId!, parseInt(req.params.id));
    res.json({ list });
  } catch (error: any) {
    next(error);
  }
});

// List lists
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const service = new ListService();
    const lists = await service.listLists(req.userId!);
    res.json({ lists });
  } catch (error: any) {
    next(error);
  }
});

// Update list
router.put('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const service = new ListService();
    const list = await service.updateList(req.userId!, parseInt(req.params.id), req.body);
    res.json({ list });
  } catch (error: any) {
    next(error);
  }
});

// Delete list
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const service = new ListService();
    await service.deleteList(req.userId!, parseInt(req.params.id));
    res.json({ success: true });
  } catch (error: any) {
    next(error);
  }
});

// Bulk add contacts to list (MUST come before /:id/contacts/:contactId)
router.post('/:id/contacts/bulk', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { contactIds } = req.body;
    
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      throw createError('contactIds array is required', 400);
    }

    // Validate and parse all contact IDs
    const parsedContactIds = contactIds
      .map((id: any) => {
        const parsed = parseInt(String(id), 10);
        return isNaN(parsed) ? null : parsed;
      })
      .filter((id: number | null): id is number => id !== null);

    if (parsedContactIds.length === 0) {
      throw createError('No valid contact IDs provided', 400);
    }

    if (parsedContactIds.length !== contactIds.length) {
      throw createError('Some contact IDs are invalid', 400);
    }

    const listId = parseInt(req.params.id, 10);
    if (isNaN(listId) || listId <= 0) {
      throw createError('Invalid list ID', 400);
    }

    const service = new ListService();
    const result = await service.addContactsToList(
      req.userId!,
      listId,
      parsedContactIds
    );
    
    res.json({ success: true, ...result });
  } catch (error: any) {
    next(error);
  }
});

// Preview list contacts with rules (without saving) - MUST come before /:id/contacts/:contactId
router.post('/:id/contacts/preview', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const listId = parseInt(req.params.id, 10);
    
    if (isNaN(listId) || listId <= 0) {
      throw createError('Invalid list ID', 400);
    }

    const { rules, limit } = req.body;
    
    if (!rules) {
      throw createError('Rules are required for preview', 400);
    }

    const service = new ListService();
    const result = await service.previewListContacts(
      req.userId!,
      listId,
      rules,
      {
        page: 1,
        limit: limit || 50,
      }
    );
    res.json(result);
  } catch (error: any) {
    next(error);
  }
});

// Import contacts from CSV and add to list (MUST come before /:id/contacts/:contactId)
router.post('/:id/contacts/import', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const listId = parseInt(req.params.id, 10);
    
    if (isNaN(listId) || listId <= 0) {
      throw createError('Invalid list ID', 400);
    }

    if (!req.body.csv || typeof req.body.csv !== 'string') {
      throw createError('CSV data required', 400);
    }

    const columnMapping = req.body.columnMapping || {};

    // Parse CSV
    let records: any[];
    try {
      records = parse(req.body.csv, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true,
        skip_records_with_empty_values: false,
      });
    } catch (parseError: any) {
      throw createError(`CSV parsing error: ${parseError.message}`, 400);
    }

    if (!records || records.length === 0) {
      throw createError('CSV file appears to be empty or has no data rows.', 400);
    }

    // Map records using provided mapping or smart field mapping
    const contacts = records
      .map((record: any) => {
        let mapped: any;
        
        // If column mapping is provided, use it
        if (columnMapping && Object.keys(columnMapping).length > 0) {
          mapped = {
            email: columnMapping.email ? (record[columnMapping.email] || '').trim() : '',
            name: columnMapping.name ? (record[columnMapping.name] || '').trim() : undefined,
            company: columnMapping.company ? (record[columnMapping.company] || '').trim() : undefined,
            role: columnMapping.role ? (record[columnMapping.role] || '').trim() : undefined,
            country: columnMapping.country ? (record[columnMapping.country] || '').trim() : undefined,
            subscription_status: columnMapping.subscription_status 
              ? (record[columnMapping.subscription_status] || '').trim().toLowerCase() || 'subscribed'
              : 'subscribed',
          };
        } else {
          // Fall back to smart field mapping
          mapped = mapContactFields(record);
        }
        
        return mapped;
      })
      .filter((c: any) => c.email && c.email.trim() && c.email.length > 0); // Filter out contacts without email

    if (contacts.length === 0) {
      const sampleColumns = records.length > 0 ? Object.keys(records[0]).join(', ') : 'none';
      throw createError(
        `No valid contacts found in CSV. Detected columns: ${sampleColumns}. ` +
        `Ensure your CSV has a column containing email addresses and that the email column is properly mapped.`,
        400
      );
    }

    const service = new ListService();
    const result = await service.importContactsFromCSV(req.userId!, listId, contacts);
    
    res.json({
      success: true,
      ...result,
    });
  } catch (error: any) {
    return next(error);
  }
});

// Add contact to list (MUST come after /bulk, /preview, and /import routes)
router.post('/:id/contacts/:contactId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const listId = parseInt(req.params.id, 10);
    const contactId = parseInt(req.params.contactId, 10);

    if (isNaN(listId) || listId <= 0) {
      throw createError('Invalid list ID', 400);
    }
    if (isNaN(contactId) || contactId <= 0) {
      throw createError('Invalid contact ID', 400);
    }

    const service = new ListService();
    await service.addContactToList(
      req.userId!,
      listId,
      contactId
    );
    res.json({ success: true });
  } catch (error: any) {
    next(error);
  }
});

// Remove contact from list
router.delete('/:id/contacts/:contactId', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const service = new ListService();
    await service.removeContactFromList(
      req.userId!,
      parseInt(req.params.id),
      parseInt(req.params.contactId)
    );
    res.json({ success: true });
  } catch (error: any) {
    next(error);
  }
});

// Get list contacts
router.get('/:id/contacts', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const service = new ListService();
    const result = await service.getListContacts(req.userId!, parseInt(req.params.id), {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 50,
    });
    res.json(result);
  } catch (error: any) {
    next(error);
  }
});

export default router;


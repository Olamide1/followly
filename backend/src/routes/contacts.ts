import { Router, Response, NextFunction } from 'express';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { ContactService } from '../services/contacts';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';

const router = Router();
router.use(authenticateToken);

// Create contact
router.post('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const service = new ContactService();
    const contact = await service.createContact(req.userId!, req.body);
    res.status(201).json({ contact });
  } catch (error: any) {
    next(error);
  }
});

// List contacts
router.get('/', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const service = new ContactService();
    const searchParam = req.query.search as string;
    const result = await service.listContacts(req.userId!, {
      page: parseInt(req.query.page as string) || 1,
      limit: parseInt(req.query.limit as string) || 50,
      search: searchParam && searchParam.trim() ? searchParam.trim() : undefined,
      tags: req.query.tags ? (req.query.tags as string).split(',').map(Number) : undefined,
      subscription_status: req.query.subscription_status as string,
    });
    res.json(result);
  } catch (error: any) {
    next(error);
  }
});

// Get lists for multiple contacts (batch) - MUST come before /:id/lists
router.post('/lists/batch', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { contactIds } = req.body;
    
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      res.json({ listsByContact: {} });
      return;
    }

    // Validate and parse all contact IDs
    const parsedContactIds = contactIds
      .map((id: any) => {
        const parsed = parseInt(String(id), 10);
        return isNaN(parsed) ? null : parsed;
      })
      .filter((id: number | null): id is number => id !== null);

    if (parsedContactIds.length === 0) {
      res.json({ listsByContact: {} });
      return;
    }

    const service = new ContactService();
    const listsByContact = await service.getContactListsBatch(req.userId!, parsedContactIds);
    res.json({ listsByContact });
  } catch (error: any) {
    next(error);
  }
});

// Get lists for a contact (MUST come before /:id route)
router.get('/:id/lists', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const service = new ContactService();
    const lists = await service.getContactLists(req.userId!, parseInt(req.params.id));
    res.json({ lists });
  } catch (error: any) {
    next(error);
  }
});

// Get contact
router.get('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const service = new ContactService();
    const contact = await service.getContact(req.userId!, parseInt(req.params.id));
    res.json({ contact });
  } catch (error: any) {
    next(error);
  }
});

// Update contact
router.put('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const service = new ContactService();
    const contact = await service.updateContact(req.userId!, parseInt(req.params.id), req.body);
    res.json({ contact });
  } catch (error: any) {
    next(error);
  }
});

// Bulk delete contacts (must come before /:id route)
router.post('/bulk-delete', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const { contactIds } = req.body;
    
    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      throw createError('contactIds array is required', 400);
    }

    const service = new ContactService();
    const result = await service.deleteContacts(
      req.userId!,
      contactIds.map((id: any) => parseInt(id))
    );
    
    res.json({ success: true, ...result });
  } catch (error: any) {
    next(error);
  }
});

// Delete contact
router.delete('/:id', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const service = new ContactService();
    await service.deleteContact(req.userId!, parseInt(req.params.id));
    res.json({ success: true });
  } catch (error: any) {
    next(error);
  }
});

// Smart column mapper - handles various column name variations
function mapContactFields(record: any): any {
  // First, try to find email in original record (case-insensitive)
  let email: string | undefined;
  
  // Check original keys first (case-insensitive) - prioritize exact matches
  for (const [key, value] of Object.entries(record)) {
    if (!value) continue;
    
    const keyLower = key.toLowerCase().trim();
    const normalizedKey = keyLower.replace(/[\s\-_\.]/g, '');
    
    // Exact matches first
    if ((normalizedKey === 'email' || normalizedKey === 'emailaddress' || 
         keyLower === 'email' || keyLower === 'e-mail' || keyLower === 'mail') && 
        value) {
      const strValue = String(value).trim();
      if (strValue.length > 0 && strValue.includes('@')) {
        email = strValue;
        break;
      }
    }
  }
  
  // If not found, try any key containing "email"
  if (!email) {
    for (const [key, value] of Object.entries(record)) {
      if (!value) continue;
      const keyLower = key.toLowerCase().trim();
      if (keyLower.includes('email') || keyLower === 'mail') {
        const strValue = String(value).trim();
        if (strValue.length > 0 && strValue.includes('@')) {
          email = strValue;
          break;
        }
      }
    }
  }

  // Normalize keys: lowercase, trim, remove spaces/special chars
  const normalizedRecord: any = {};
  for (const [key, value] of Object.entries(record)) {
    const normalized = key.toLowerCase().trim().replace(/[\s\-_\.]/g, '');
    if (!normalizedRecord[normalized] && value) {
      normalizedRecord[normalized] = value;
    }
  }

  // Email variations - try normalized first, then original
  if (!email) {
    email = findField(normalizedRecord, ['email', 'e-mail', 'emailaddress', 'mail', 'contactemail']) ||
            findField(record, ['email', 'Email', 'EMAIL', 'e-mail', 'E-mail', 'E-Mail', 'Email Address', 'email_address', 'EmailAddress']);
  }

  // Name variations - try full name first, then combine first/last
  const name = 
    findField(normalizedRecord, ['name', 'fullname', 'contactname', 'displayname']) ||
    findField(record, ['name', 'Name', 'NAME', 'full_name', 'Full Name', 'fullName', 'contact_name', 'FullName']) ||
    combineName(
      findField(normalizedRecord, ['firstname', 'first']) || findField(record, ['first_name', 'First Name', 'firstName', 'first', 'First']),
      findField(normalizedRecord, ['lastname', 'last']) || findField(record, ['last_name', 'Last Name', 'lastName', 'last', 'Last'])
    );

  // Company variations
  const company = 
    findField(normalizedRecord, ['company', 'organization', 'org', 'organisation', 'employer', 'business']) ||
    findField(record, ['company', 'Company', 'COMPANY', 'company_name', 'Company Name', 'organization', 'Organization', 'org', 'Org']);

  // Role/Title variations
  const role = 
    findField(normalizedRecord, ['role', 'title', 'jobtitle', 'position', 'job', 'designation']) ||
    findField(record, ['role', 'Role', 'ROLE', 'title', 'Title', 'job_title', 'Job Title', 'position', 'Position', 'jobTitle']);

  // Country variations
  const country = 
    findField(normalizedRecord, ['country', 'nation', 'location']) ||
    findField(record, ['country', 'Country', 'COUNTRY', 'nation', 'Nation', 'location', 'Location']);

  // Subscription status variations
  const subscription_status = 
    findField(normalizedRecord, ['subscriptionstatus', 'status', 'subscribed', 'optin', 'subscribedstatus']) ||
    findField(record, ['subscription_status', 'Subscription Status', 'status', 'Status', 'subscribed', 'Subscribed', 'opt_in', 'Opt In']) ||
    'subscribed';

  return {
    email: email?.trim(),
    name: name?.trim() || undefined,
    company: company?.trim() || undefined,
    role: role?.trim() || undefined,
    country: country?.trim() || undefined,
    subscription_status: subscription_status || 'subscribed',
  };
}

// Helper to find field with multiple possible keys
function findField(record: any, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];
    if (value !== null && value !== undefined) {
      // Convert to string and trim
      const strValue = String(value).trim();
      if (strValue.length > 0) {
        return strValue;
      }
    }
  }
  return undefined;
}

// Combine first and last name
function combineName(first?: string, last?: string): string | undefined {
  if (first && last) {
    return `${first.trim()} ${last.trim()}`.trim();
  }
  return first || last || undefined;
}

// Import contacts (CSV)
router.post('/import', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    if (!req.body.csv || typeof req.body.csv !== 'string') {
      throw createError('CSV data required', 400);
    }

    const columnMapping = req.body.columnMapping || {};

    let records: any[];
    try {
      records = parse(req.body.csv, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
        relax_column_count: true, // Allow inconsistent column counts
        skip_records_with_empty_values: false, // Keep records even if some fields are empty
      });
    } catch (parseError: any) {
      throw createError(`CSV parsing error: ${parseError.message}`, 400);
    }

    if (!records || records.length === 0) {
      throw createError('CSV file appears to be empty or has no data rows.', 400);
    }

    // Log first record for debugging (in development)
    if (process.env.NODE_ENV === 'development' && records.length > 0) {
      console.log('First CSV record sample:', JSON.stringify(records[0], null, 2));
      console.log('Available columns:', Object.keys(records[0]));
      console.log('Column mapping:', columnMapping);
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
        
        // Log if email not found (for debugging)
        if (!mapped.email && process.env.NODE_ENV === 'development') {
          console.log('No email found in record:', JSON.stringify(record, null, 2));
        }
        return mapped;
      })
      .filter((c: any) => c.email && c.email.trim() && c.email.length > 0); // Filter out contacts without email

    if (contacts.length === 0) {
      // Provide helpful error message with detected columns
      const sampleColumns = records.length > 0 ? Object.keys(records[0]).join(', ') : 'none';
      throw createError(
        `No valid contacts found in CSV. Detected columns: ${sampleColumns}. ` +
        `Ensure your CSV has a column containing email addresses and that the email column is properly mapped.`,
        400
      );
    }

    const service = new ContactService();
    const result = await service.importContacts(req.userId!, contacts);

    res.json(result);
  } catch (error: any) {
    next(error);
  }
});

// Export contacts (CSV)
router.get('/export/csv', async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const service = new ContactService();
    const result = await service.listContacts(req.userId!, { limit: 10000 });

    const csv = stringify(result.contacts, {
      header: true,
      columns: ['email', 'name', 'company', 'role', 'country', 'subscription_status'],
    });

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename=contacts.csv');
    res.send(csv);
  } catch (error: any) {
    next(error);
  }
});

export default router;


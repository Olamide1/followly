import { Router, Response, NextFunction } from 'express';
import { ListService } from '../services/lists';
import { authenticateToken, AuthRequest } from '../middleware/auth';
import { createError } from '../middleware/errorHandler';

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

// Add contact to list (MUST come after /bulk and /preview routes)
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


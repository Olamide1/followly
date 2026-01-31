import { Job } from 'bull';
import { ListService } from '../services/lists';

/**
 * Process contact import job
 * This worker processes contact imports in batches to avoid timeouts
 */
export async function processContactImportQueue(job: Job) {
  const { userId, listId, contacts } = job.data;

  if (!userId || !listId || !contacts || !Array.isArray(contacts)) {
    throw new Error('Missing required fields: userId, listId, and contacts array');
  }

  console.log(`[Contact Import Worker] Processing import for list ${listId}, user ${userId}, ${contacts.length} contacts`);

  const listService = new ListService();

  // Process the contact import (this will handle batching internally)
  const result = await listService.importContactsFromCSV(userId, listId, contacts);

  console.log(`[Contact Import Worker] Import completed: ${result.imported} imported, ${result.added} added, ${result.updated} updated, ${result.failed} failed`);

  return result;
}

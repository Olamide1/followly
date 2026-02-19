import { Job } from 'bull';
import { ListService } from '../services/lists';

/**
 * Process contact import job
 * This worker processes contact imports in batches to avoid timeouts
 */
export async function processContactImportQueue(job: Job) {
  const { userId, teamUserIds, listId, contacts } = job.data;

  if (!userId || !listId || !contacts || !Array.isArray(contacts)) {
    throw new Error('Missing required fields: userId, listId, and contacts array');
  }

  // Use teamUserIds if provided, otherwise fall back to resolving from userId
  let resolvedTeamUserIds = teamUserIds;
  if (!resolvedTeamUserIds) {
    try {
      const { resolveTeamUserIds } = await import('../services/team');
      resolvedTeamUserIds = await resolveTeamUserIds(userId);
    } catch {
      resolvedTeamUserIds = [userId];
    }
  }

  console.log(`[Contact Import Worker] Processing import for list ${listId}, user ${userId}, ${contacts.length} contacts`);

  const listService = new ListService();

  // Process the contact import (this will handle batching internally)
  const result = await listService.importContactsFromCSV(userId, resolvedTeamUserIds, listId, contacts);

  console.log(`[Contact Import Worker] Import completed: ${result.imported} imported, ${result.added} added, ${result.updated} updated, ${result.failed} failed`);

  return result;
}

import { Job } from 'bull';
import { AutomationService } from '../services/automations';

let automationService: AutomationService;

export async function processAutomationQueue(job: Job) {
  const { userId, automationId, contactId, stepOrder } = job.data;

  try {
    if (!automationService) {
      automationService = new AutomationService();
    }

    await automationService.processAutomationStep(
      userId,
      automationId,
      contactId,
      stepOrder
    );

    return { success: true };
  } catch (error: any) {
    console.error('Automation processing error:', error);
    throw error;
  }
}


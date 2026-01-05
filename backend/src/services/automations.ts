import { pool } from '../database/connection';
import { createError } from '../middleware/errorHandler';
// import { getAutomationQueue } from './queues'; // DISABLED: Temporarily commented out

export interface AutomationTrigger {
  type: 'contact_created' | 'added_to_list' | 'field_equals' | 'time_since_signup';
  config: Record<string, any>;
}

export interface AutomationStep {
  action_type: 'send_email' | 'wait' | 'add_to_list' | 'update_attribute' | 'exit';
  action_config: Record<string, any>;
  delay_hours?: number;
}

export interface AutomationData {
  name: string;
  description?: string;
  trigger: AutomationTrigger;
  steps: AutomationStep[];
}

export class AutomationService {
  async createAutomation(userId: number, data: AutomationData) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Create automation
      const automationResult = await client.query(
        `INSERT INTO automations 
         (user_id, name, description, trigger_type, trigger_config)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [
          userId,
          data.name,
          data.description,
          data.trigger.type,
          JSON.stringify(data.trigger.config),
        ]
      );

      const automation = automationResult.rows[0];

      // Create steps
      for (let i = 0; i < data.steps.length; i++) {
        const step = data.steps[i];
        await client.query(
          `INSERT INTO automation_steps 
           (automation_id, step_order, action_type, action_config, delay_hours)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            automation.id,
            i + 1,
            step.action_type,
            JSON.stringify(step.action_config),
            step.delay_hours || 0,
          ]
        );
      }

      await client.query('COMMIT');
      return automation;
    } catch (error: any) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async getAutomation(userId: number, automationId: number) {
    const result = await pool.query(
      'SELECT * FROM automations WHERE id = $1 AND user_id = $2',
      [automationId, userId]
    );

    if (result.rows.length === 0) {
      throw createError('Automation not found', 404);
    }

    const automation = result.rows[0];
    if (automation.trigger_config) {
      automation.trigger_config = typeof automation.trigger_config === 'string'
        ? JSON.parse(automation.trigger_config)
        : automation.trigger_config;
    }

    // Get steps
    const stepsResult = await pool.query(
      'SELECT * FROM automation_steps WHERE automation_id = $1 ORDER BY step_order',
      [automationId]
    );

    automation.steps = stepsResult.rows.map((step: any) => ({
      ...step,
      action_config: typeof step.action_config === 'string'
        ? JSON.parse(step.action_config)
        : step.action_config,
    }));

    return automation;
  }

  async listAutomations(userId: number, options: {
    status?: string;
  } = {}) {
    let query = 'SELECT * FROM automations WHERE user_id = $1';
    const params: any[] = [userId];

    if (options.status) {
      query += ' AND status = $2';
      params.push(options.status);
    }

    query += ' ORDER BY created_at DESC';

    const result = await pool.query(query, params);

    // Parse trigger configs
    for (const automation of result.rows) {
      if (automation.trigger_config) {
        automation.trigger_config = typeof automation.trigger_config === 'string'
          ? JSON.parse(automation.trigger_config)
          : automation.trigger_config;
      }
    }

    return result.rows;
  }

  async updateAutomation(
    userId: number,
    automationId: number,
    data: Partial<AutomationData>
  ) {
    await this.getAutomation(userId, automationId); // Verify exists

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
    if (data.trigger !== undefined) {
      updates.push(`trigger_type = $${paramCount++}`);
      updates.push(`trigger_config = $${paramCount++}`);
      params.push(data.trigger.type, JSON.stringify(data.trigger.config));
    }

    if (updates.length > 0) {
      updates.push(`updated_at = CURRENT_TIMESTAMP`);
      params.push(automationId, userId);

      await pool.query(
        `UPDATE automations SET ${updates.join(', ')} WHERE id = $${paramCount++} AND user_id = $${paramCount++}`,
        params
      );
    }

    // Update steps if provided
    if (data.steps !== undefined) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Delete existing steps
        await client.query('DELETE FROM automation_steps WHERE automation_id = $1', [automationId]);

        // Insert new steps
        for (let i = 0; i < data.steps.length; i++) {
          const step = data.steps[i];
          await client.query(
            `INSERT INTO automation_steps 
             (automation_id, step_order, action_type, action_config, delay_hours)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              automationId,
              i + 1,
              step.action_type,
              JSON.stringify(step.action_config),
              step.delay_hours || 0,
            ]
          );
        }

        await client.query('COMMIT');
      } catch (error: any) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    return this.getAutomation(userId, automationId);
  }

  async deleteAutomation(userId: number, automationId: number) {
    const result = await pool.query(
      'DELETE FROM automations WHERE id = $1 AND user_id = $2 RETURNING id',
      [automationId, userId]
    );

    if (result.rows.length === 0) {
      throw createError('Automation not found', 404);
    }
  }

  async pauseAutomation(userId: number, automationId: number) {
    await pool.query(
      'UPDATE automations SET status = $1 WHERE id = $2 AND user_id = $3',
      ['paused', automationId, userId]
    );
  }

  async activateAutomation(userId: number, automationId: number) {
    await pool.query(
      'UPDATE automations SET status = $1 WHERE id = $2 AND user_id = $3',
      ['active', automationId, userId]
    );
  }

  async triggerAutomation(
    userId: number,
    automationId: number,
    contactId: number,
    triggerData?: Record<string, any>
  ) {
    // Suppress unused parameter warnings - only used in disabled queue code
    void userId;
    void triggerData;
    
    // Check if execution already exists (prevent duplicates)
    const existing = await pool.query(
      'SELECT id FROM automation_executions WHERE automation_id = $1 AND contact_id = $2',
      [automationId, contactId]
    );

    if (existing.rows.length > 0) {
      return; // Already executing
    }

    // Create execution
    await pool.query(
      `INSERT INTO automation_executions 
       (automation_id, contact_id, status)
       VALUES ($1, $2, 'active')`,
      [automationId, contactId]
    );

    // Queue first step - DISABLED: Temporarily commented out
    // const automationQueue = getAutomationQueue();
    // await automationQueue.add({
    //   userId,
    //   automationId,
    //   contactId,
    //   stepOrder: 1,
    //   triggerData,
    // });
  }

  async processAutomationStep(
    userId: number,
    automationId: number,
    contactId: number,
    stepOrder: number
  ) {
    // Get automation and step
    const automation = await this.getAutomation(userId, automationId);
    const step = automation.steps.find((s: any) => s.step_order === stepOrder);

    if (!step) {
      // No more steps, complete execution
      await pool.query(
        'UPDATE automation_executions SET status = $1, completed_at = CURRENT_TIMESTAMP WHERE automation_id = $2 AND contact_id = $3',
        ['completed', automationId, contactId]
      );
      return;
    }

    // Check if contact is still subscribed
    const contactResult = await pool.query(
      'SELECT subscription_status FROM contacts WHERE id = $1',
      [contactId]
    );

    if (contactResult.rows.length === 0 || contactResult.rows[0].subscription_status !== 'subscribed') {
      // Exit automation
      await pool.query(
        'UPDATE automation_executions SET status = $1 WHERE automation_id = $2 AND contact_id = $3',
        ['exited', automationId, contactId]
      );
      return;
    }

    // Execute step action
    switch (step.action_type) {
      case 'send_email':
        await this.executeSendEmail(userId, automationId, contactId, step);
        break;
      case 'wait':
        // Just wait, will continue to next step after delay
        break;
      case 'add_to_list':
        await this.executeAddToList(userId, contactId, step);
        break;
      case 'update_attribute':
        await this.executeUpdateAttribute(userId, contactId, step);
        break;
      case 'exit':
        await pool.query(
          'UPDATE automation_executions SET status = $1 WHERE automation_id = $2 AND contact_id = $3',
          ['exited', automationId, contactId]
        );
        return;
    }

    // Schedule next step
    const delayHours = step.delay_hours || 0;
    const nextStepOrder = stepOrder + 1;
    // Suppress unused variable warning - nextStepOrder only used in disabled queue code
    void nextStepOrder;

    if (delayHours > 0) {
      // DISABLED: Temporarily commented out
      // const automationQueue = getAutomationQueue();
      // await automationQueue.add(
      //   {
      //     userId,
      //     automationId,
      //     contactId,
      //     stepOrder: nextStepOrder,
      //   },
      //   {
      //     delay: delayHours * 60 * 60 * 1000, // Convert hours to milliseconds
      //   }
      // );
    } else {
      // Process immediately - DISABLED: Temporarily commented out
      // await this.processAutomationStep(userId, automationId, contactId, nextStepOrder);
    }
  }

  private async executeSendEmail(
    userId: number,
    automationId: number,
    contactId: number,
    step: any
  ) {
    const contactResult = await pool.query(
      'SELECT * FROM contacts WHERE id = $1',
      [contactId]
    );

    if (contactResult.rows.length === 0) {
      return;
    }

    const contact = contactResult.rows[0];
    const config = step.action_config;

    // Personalize
    const personalizationService = (await import('./personalization')).PersonalizationService.getInstance();
    const personalizationData = {
      name: contact.name || '',
      company: contact.company || '',
      email: contact.email,
    };

    const subject = personalizationService.renderTemplate(config.subject, personalizationData);
    let content = personalizationService.renderTemplate(config.content, personalizationData);

    // Append unsubscribe footer automatically
    const { appendUnsubscribeFooter } = await import('./unsubscribe');
    content = await appendUnsubscribeFooter(
      userId,
      contact.email,
      content,
      {
        includePreferences: true,
        includeViewInBrowser: false,
      }
    );

    const scheduledAt = new Date();

    // Create email_queue record upfront for tracking
    const emailQueueResult = await pool.query(
      `INSERT INTO email_queue 
       (user_id, contact_id, automation_id, automation_step_id, to_email, subject, content, from_email, from_name, status, scheduled_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        userId,
        contactId,
        automationId,
        step.id,
        contact.email,
        subject,
        content,
        config.from_email || process.env.DEFAULT_FROM_EMAIL,
        config.from_name || process.env.DEFAULT_FROM_NAME,
        'queued',
        scheduledAt,
      ]
    );
    const emailQueueId = emailQueueResult.rows[0].id;

    // Add to Bull queue
    const emailQueue = (await import('./queues')).getEmailQueue();
    await emailQueue.add({
      userId,
      contactId,
      automationId,
      automationStepId: step.id,
      emailQueueId, // Include email_queue_id in job data
      toEmail: contact.email,
      subject,
      content,
      fromEmail: config.from_email || process.env.DEFAULT_FROM_EMAIL,
      fromName: config.from_name || process.env.DEFAULT_FROM_NAME,
      scheduledAt: scheduledAt.toISOString(),
    }, {
      jobId: `email-${emailQueueId}`,
    });
  }

  private async executeAddToList(_userId: number, contactId: number, step: any) {
    const listId = step.action_config.list_id;
    if (listId) {
      await pool.query(
        'INSERT INTO list_contacts (list_id, contact_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [listId, contactId]
      );
    }
  }

  private async executeUpdateAttribute(_userId: number, contactId: number, step: any) {
    const config = step.action_config;
    if (config.field && config.value !== undefined) {
      const updates: string[] = [];
      const params: any[] = [];
      let paramCount = 1;

      if (config.field === 'subscription_status') {
        updates.push(`subscription_status = $${paramCount++}`);
        params.push(config.value);
      } else if (config.field === 'name') {
        updates.push(`name = $${paramCount++}`);
        params.push(config.value);
      } else if (config.field === 'company') {
        updates.push(`company = $${paramCount++}`);
        params.push(config.value);
      }

      if (updates.length > 0) {
        params.push(contactId);
        await pool.query(
          `UPDATE contacts SET ${updates.join(', ')} WHERE id = $${paramCount++}`,
          params
        );
      }
    }
  }
}


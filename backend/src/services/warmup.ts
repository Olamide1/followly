import { pool } from '../database/connection';

export interface WarmupMetrics {
  bounceRate: number;
  complaintRate: number;
  deliveredRate: number;
  openRate: number;
}

export class WarmupService {
  /**
   * Validate input parameters
   */
  private validateInputs(userId: number, domain: string, provider: string): void {
    if (!userId || userId <= 0 || !Number.isInteger(userId)) {
      throw new Error('Invalid userId: must be a positive integer');
    }
    if (!domain || typeof domain !== 'string' || domain.trim().length === 0) {
      throw new Error('Invalid domain: must be a non-empty string');
    }
    if (!provider || typeof provider !== 'string' || provider.trim().length === 0) {
      throw new Error('Invalid provider: must be a non-empty string');
    }
    const validProviders = ['resend', 'brevo', 'mailjet', 'nodemailer'];
    if (!validProviders.includes(provider.toLowerCase())) {
      throw new Error(`Invalid provider: ${provider}. Must be one of: ${validProviders.join(', ')}`);
    }
  }

  async getWarmupSchedule(userId: number, domain: string, provider: string) {
    this.validateInputs(userId, domain, provider);
    const normalizedDomain = domain.trim().toLowerCase();
    const normalizedProvider = provider.trim().toLowerCase();

    try {
      const result = await pool.query(
        `SELECT * FROM warmup_schedules 
         WHERE user_id = $1 AND domain = $2 AND provider = $3`,
        [userId, normalizedDomain, normalizedProvider]
      );
      return result.rows[0] || null;
    } catch (error: any) {
      console.error(`[Warmup] Error getting schedule for ${normalizedDomain}/${normalizedProvider}:`, error?.message || error);
      throw new Error(`Failed to get warmup schedule: ${error?.message || 'Unknown error'}`);
    }
  }

  async createWarmupSchedule(
    userId: number,
    domain: string,
    provider: string
  ) {
    this.validateInputs(userId, domain, provider);
    const normalizedDomain = domain.trim().toLowerCase();
    const normalizedProvider = provider.trim().toLowerCase();

    try {
      const existing = await this.getWarmupSchedule(userId, normalizedDomain, normalizedProvider);
      if (existing) {
        return existing;
      }

      // Automatic warmup schedule based on provider type
      // ESPs (Resend, Brevo, Mailjet) have higher limits, SMTP/Nodemailer is more conservative
      const isESP = ['resend', 'brevo', 'mailjet'].includes(normalizedProvider);
      
      // Phase 1: Start small but reasonable
      // ESPs: 100 emails/day (they handle reputation)
      // SMTP: 50 emails/day (increased from 20 - allows ~2/hour which is safe for warmup)
      // Industry standard: 20-50/day for new domains, we use 50 for better usability
      const initialLimit = isESP ? 100 : 50;

      const result = await pool.query(
        `INSERT INTO warmup_schedules 
         (user_id, domain, provider, phase, daily_limit, start_date, last_reset_date)
         VALUES ($1, $2, $3, 1, $4, CURRENT_DATE, CURRENT_DATE)
         RETURNING *`,
        [userId, normalizedDomain, normalizedProvider, initialLimit]
      );
      
      if (result.rows.length === 0) {
        throw new Error('Failed to create warmup schedule');
      }
      
      console.log(`[Warmup] Auto-created warmup schedule for ${normalizedDomain} with ${normalizedProvider}: ${initialLimit} emails/day`);
      return result.rows[0];
    } catch (error: any) {
      if (error.message.includes('Invalid') || error.message.includes('Failed to get')) {
        throw error; // Re-throw validation errors
      }
      console.error(`[Warmup] Error creating schedule for ${normalizedDomain}/${normalizedProvider}:`, error?.message || error);
      throw new Error(`Failed to create warmup schedule: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Automatically create warmup schedule if domain is new
   * Called when sending emails to ensure all domains are warmed up
   */
  async ensureWarmupSchedule(userId: number, domain: string, provider: string): Promise<void> {
    try {
      const existing = await this.getWarmupSchedule(userId, domain, provider);
      if (!existing) {
        await this.createWarmupSchedule(userId, domain, provider);
      }
    } catch (error: any) {
      // Log but don't throw - warmup failures shouldn't block email sending
      console.error(`[Warmup] Error ensuring warmup schedule:`, error?.message || error);
    }
  }

  async getDailyLimit(userId: number, domain: string, provider: string): Promise<number> {
    this.validateInputs(userId, domain, provider);
    const normalizedDomain = domain.trim().toLowerCase();
    const normalizedProvider = provider.trim().toLowerCase();

    try {
      const schedule = await this.getWarmupSchedule(userId, normalizedDomain, normalizedProvider);
      
      if (!schedule) {
        // Not in warmup, return high limit
        return 10000;
      }

      // Check if we need to reset daily count
      const today = new Date().toISOString().split('T')[0];
      const lastReset = schedule.last_reset_date ? new Date(schedule.last_reset_date).toISOString().split('T')[0] : null;
      
      if (lastReset !== today) {
        await pool.query(
          'UPDATE warmup_schedules SET current_count = 0, last_reset_date = CURRENT_DATE WHERE id = $1',
          [schedule.id]
        );
        schedule.current_count = 0;
      }

      const dailyLimit = schedule.daily_limit || 10000;
      if (dailyLimit < 0) {
        throw new Error(`Invalid daily_limit: ${dailyLimit}. Must be non-negative`);
      }

      return dailyLimit;
    } catch (error: any) {
      if (error.message.includes('Invalid')) {
        throw error; // Re-throw validation errors
      }
      console.error(`[Warmup] Error getting daily limit:`, error?.message || error);
      // Return safe default on error
      return 10000;
    }
  }

  async canSend(userId: number, domain: string, provider: string): Promise<boolean> {
    try {
      const schedule = await this.getWarmupSchedule(userId, domain, provider);
      
      if (!schedule) {
        return true; // Not in warmup
      }

      const dailyLimit = await this.getDailyLimit(userId, domain, provider);
      const currentCount = schedule.current_count || 0;
      return currentCount < dailyLimit;
    } catch (error: any) {
      // Fail open - if we can't check warmup, allow sending
      console.error(`[Warmup] Error checking canSend:`, error?.message || error);
      return true;
    }
  }

  async recordSend(userId: number, domain: string, provider: string): Promise<void> {
    try {
      const schedule = await this.getWarmupSchedule(userId, domain, provider);
      
      if (!schedule) {
        return; // Not in warmup
      }

      await pool.query(
        'UPDATE warmup_schedules SET current_count = current_count + 1 WHERE id = $1',
        [schedule.id]
      );
    } catch (error: any) {
      // Don't throw - recording failures shouldn't block email sending
      console.error(`[Warmup] Error recording send:`, error?.message || error);
    }
  }

  async updateMetrics(
    userId: number,
    domain: string,
    provider: string,
    metrics: WarmupMetrics
  ): Promise<void> {
    this.validateInputs(userId, domain, provider);
    const normalizedDomain = domain.trim().toLowerCase();
    const normalizedProvider = provider.trim().toLowerCase();

    // Validate metrics
    if (!metrics || typeof metrics !== 'object') {
      throw new Error('Invalid metrics: must be an object');
    }
    if (typeof metrics.bounceRate !== 'number' || metrics.bounceRate < 0 || metrics.bounceRate > 1) {
      throw new Error('Invalid bounceRate: must be a number between 0 and 1');
    }
    if (typeof metrics.complaintRate !== 'number' || metrics.complaintRate < 0 || metrics.complaintRate > 1) {
      throw new Error('Invalid complaintRate: must be a number between 0 and 1');
    }

    try {
      const schedule = await this.getWarmupSchedule(userId, normalizedDomain, normalizedProvider);
      
      if (!schedule) {
        return;
      }

      const currentMetrics = schedule.metrics || {};
      const updatedMetrics = {
        ...currentMetrics,
        ...metrics,
        lastUpdated: new Date().toISOString(),
      };

      // Check if we need to slow down
      if (metrics.bounceRate > 0.05 || metrics.complaintRate > 0.001) {
        // Slow down - reduce daily limit
        const newLimit = Math.max(10, Math.floor((schedule.daily_limit || 100) * 0.5));
        await pool.query(
          'UPDATE warmup_schedules SET daily_limit = $1, metrics = $2 WHERE id = $3',
          [newLimit, JSON.stringify(updatedMetrics), schedule.id]
        );
      } else if (schedule.phase < 4 && metrics.bounceRate < 0.01 && metrics.complaintRate < 0.0001) {
        // Progress to next phase
        const phase = (schedule.phase || 1) + 1;
        // Progressive warmup: Phase 2 (200/day), Phase 3 (500/day), Phase 4 (1000/day)
        const dailyLimit = phase === 2 ? 200 : phase === 3 ? 500 : 1000;
        
        await pool.query(
          'UPDATE warmup_schedules SET phase = $1, daily_limit = $2, metrics = $3 WHERE id = $4',
          [phase, dailyLimit, JSON.stringify(updatedMetrics), schedule.id]
        );
      } else {
        // Just update metrics
        await pool.query(
          'UPDATE warmup_schedules SET metrics = $1 WHERE id = $2',
          [JSON.stringify(updatedMetrics), schedule.id]
        );
      }
    } catch (error: any) {
      if (error.message.includes('Invalid')) {
        throw error; // Re-throw validation errors
      }
      console.error(`[Warmup] Error updating metrics:`, error?.message || error);
      throw new Error(`Failed to update metrics: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Fast-track warmup to Phase 3 (500/day) - safer than completing, still monitors reputation
   */
  async fastTrackWarmup(userId: number, domain: string, provider: string): Promise<void> {
    this.validateInputs(userId, domain, provider);
    const normalizedDomain = domain.trim().toLowerCase();
    const normalizedProvider = provider.trim().toLowerCase();

    try {
      const result = await pool.query(
        `UPDATE warmup_schedules 
         SET phase = 3, daily_limit = 500, updated_at = CURRENT_TIMESTAMP 
         WHERE user_id = $1 AND domain = $2 AND provider = $3 
         RETURNING id`,
        [userId, normalizedDomain, normalizedProvider]
      );

      if (result.rows.length === 0) {
        throw new Error(`No warmup schedule found for domain ${normalizedDomain} with provider ${normalizedProvider}`);
      }
      
      console.log(`[Warmup] Fast-tracked ${normalizedDomain} (${normalizedProvider}) to Phase 3 (500/day)`);
    } catch (error: any) {
      if (error.message.includes('Invalid') || error.message.includes('No warmup schedule')) {
        throw error;
      }
      console.error(`[Warmup] Error fast-tracking warmup:`, error?.message || error);
      throw new Error(`Failed to fast-track warmup: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Set temporary increase with auto-revert date
   */
  async setTemporaryIncrease(
    userId: number, 
    domain: string, 
    provider: string, 
    dailyLimit: number, 
    revertAfterDays: number = 7
  ): Promise<void> {
    this.validateInputs(userId, domain, provider);
    const normalizedDomain = domain.trim().toLowerCase();
    const normalizedProvider = provider.trim().toLowerCase();

    if (dailyLimit < 0 || dailyLimit > 2000) {
      throw new Error('dailyLimit must be between 0 and 2000');
    }
    if (revertAfterDays < 1 || revertAfterDays > 30) {
      throw new Error('revertAfterDays must be between 1 and 30');
    }

    try {
      const revertDate = new Date();
      revertDate.setDate(revertDate.getDate() + revertAfterDays);

      const result = await pool.query(
        `UPDATE warmup_schedules 
         SET daily_limit = $1, 
             metrics = COALESCE(metrics, '{}'::jsonb) || jsonb_build_object('temporaryIncrease', true, 'originalLimit', daily_limit, 'revertDate', $2::text),
             updated_at = CURRENT_TIMESTAMP 
         WHERE user_id = $3 AND domain = $4 AND provider = $5 
         RETURNING id`,
        [dailyLimit, revertDate.toISOString(), userId, normalizedDomain, normalizedProvider]
      );

      if (result.rows.length === 0) {
        throw new Error(`No warmup schedule found for domain ${normalizedDomain} with provider ${normalizedProvider}`);
      }
      
      console.log(`[Warmup] Set temporary increase for ${normalizedDomain} (${normalizedProvider}): ${dailyLimit}/day, reverts on ${revertDate.toISOString()}`);
    } catch (error: any) {
      if (error.message.includes('Invalid') || error.message.includes('No warmup schedule')) {
        throw error;
      }
      console.error(`[Warmup] Error setting temporary increase:`, error?.message || error);
      throw new Error(`Failed to set temporary increase: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Check and revert temporary increases that have expired
   */
  async checkAndRevertTemporaryIncreases(): Promise<void> {
    try {
      const schedules = await pool.query(
        `SELECT id, user_id, domain, provider, daily_limit, metrics 
         FROM warmup_schedules 
         WHERE metrics->>'temporaryIncrease' = 'true' 
         AND metrics->>'revertDate' IS NOT NULL`
      );

      const now = new Date();
      let reverted = 0;

      for (const schedule of schedules.rows) {
        const metrics = schedule.metrics || {};
        const revertDateStr = metrics.revertDate;
        
        if (revertDateStr) {
          const revertDate = new Date(revertDateStr);
          if (revertDate <= now) {
            const originalLimit = metrics.originalLimit || 50; // Default to Phase 1 if not set
            
            await pool.query(
              `UPDATE warmup_schedules 
               SET daily_limit = $1, 
                   metrics = metrics - 'temporaryIncrease' - 'originalLimit' - 'revertDate',
                   updated_at = CURRENT_TIMESTAMP 
               WHERE id = $2`,
              [originalLimit, schedule.id]
            );
            
            console.log(`[Warmup] Reverted temporary increase for ${schedule.domain} (${schedule.provider}) back to ${originalLimit}/day`);
            reverted++;
          }
        }
      }

      if (reverted > 0) {
        console.log(`[Warmup] Reverted ${reverted} temporary warmup increases`);
      }
    } catch (error: any) {
      console.error(`[Warmup] Error checking temporary increases:`, error?.message || error);
    }
  }

  async completeWarmup(userId: number, domain: string, provider: string): Promise<void> {
    this.validateInputs(userId, domain, provider);
    const normalizedDomain = domain.trim().toLowerCase();
    const normalizedProvider = provider.trim().toLowerCase();

    try {
      const result = await pool.query(
        'UPDATE warmup_schedules SET status = $1 WHERE user_id = $2 AND domain = $3 AND provider = $4 RETURNING id',
        ['completed', userId, normalizedDomain, normalizedProvider]
      );

      if (result.rows.length === 0) {
        throw new Error(`No warmup schedule found for domain ${normalizedDomain} with provider ${normalizedProvider}`);
      }
    } catch (error: any) {
      if (error.message.includes('Invalid') || error.message.includes('No warmup schedule')) {
        throw error; // Re-throw validation/not found errors
      }
      console.error(`[Warmup] Error completing warmup:`, error?.message || error);
      throw new Error(`Failed to complete warmup: ${error?.message || 'Unknown error'}`);
    }
  }
}


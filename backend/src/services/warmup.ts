import { pool } from '../database/connection';

export interface WarmupMetrics {
  bounceRate: number;
  complaintRate: number;
  deliveredRate: number;
  openRate: number;
}

export class WarmupService {
  async getWarmupSchedule(userId: number, domain: string, provider: string) {
    const result = await pool.query(
      `SELECT * FROM warmup_schedules 
       WHERE user_id = $1 AND domain = $2 AND provider = $3`,
      [userId, domain, provider]
    );
    return result.rows[0] || null;
  }

  async createWarmupSchedule(
    userId: number,
    domain: string,
    provider: string
  ) {
    const existing = await this.getWarmupSchedule(userId, domain, provider);
    if (existing) {
      return existing;
    }

    // Phase 1: Start small (50 emails/day)
    const result = await pool.query(
      `INSERT INTO warmup_schedules 
       (user_id, domain, provider, phase, daily_limit, start_date, last_reset_date)
       VALUES ($1, $2, $3, 1, 50, CURRENT_DATE, CURRENT_DATE)
       RETURNING *`,
      [userId, domain, provider]
    );
    return result.rows[0];
  }

  async getDailyLimit(userId: number, domain: string, provider: string): Promise<number> {
    const schedule = await this.getWarmupSchedule(userId, domain, provider);
    
    if (!schedule) {
      // Not in warmup, return high limit
      return 10000;
    }

    // Check if we need to reset daily count
    const today = new Date().toISOString().split('T')[0];
    const lastReset = schedule.last_reset_date?.toISOString().split('T')[0];
    
    if (lastReset !== today) {
      await pool.query(
        'UPDATE warmup_schedules SET current_count = 0, last_reset_date = CURRENT_DATE WHERE id = $1',
        [schedule.id]
      );
      schedule.current_count = 0;
    }

    return schedule.daily_limit;
  }

  async canSend(userId: number, domain: string, provider: string): Promise<boolean> {
    const schedule = await this.getWarmupSchedule(userId, domain, provider);
    
    if (!schedule) {
      return true; // Not in warmup
    }

    const dailyLimit = await this.getDailyLimit(userId, domain, provider);
    return schedule.current_count < dailyLimit;
  }

  async recordSend(userId: number, domain: string, provider: string): Promise<void> {
    const schedule = await this.getWarmupSchedule(userId, domain, provider);
    
    if (!schedule) {
      return; // Not in warmup
    }

    await pool.query(
      'UPDATE warmup_schedules SET current_count = current_count + 1 WHERE id = $1',
      [schedule.id]
    );
  }

  async updateMetrics(
    userId: number,
    domain: string,
    provider: string,
    metrics: WarmupMetrics
  ): Promise<void> {
    const schedule = await this.getWarmupSchedule(userId, domain, provider);
    
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
      const newLimit = Math.max(10, Math.floor(schedule.daily_limit * 0.5));
      await pool.query(
        'UPDATE warmup_schedules SET daily_limit = $1, metrics = $2 WHERE id = $3',
        [newLimit, JSON.stringify(updatedMetrics), schedule.id]
      );
    } else if (schedule.phase < 3 && metrics.bounceRate < 0.01 && metrics.complaintRate < 0.0001) {
      // Progress to next phase
      const phase = schedule.phase + 1;
      const dailyLimit = phase === 2 ? 200 : 500; // Week 2: 200, Week 3: 500
      
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
  }

  async completeWarmup(userId: number, domain: string, provider: string): Promise<void> {
    await pool.query(
      'UPDATE warmup_schedules SET status = $1 WHERE user_id = $2 AND domain = $3 AND provider = $4',
      ['completed', userId, domain, provider]
    );
  }
}


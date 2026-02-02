import { pool } from '../database/connection';

/**
 * Industry-standard thresholds for email deliverability
 * Based on 2024 email deliverability best practices:
 * - Bounce rate: <5% is acceptable, <2% is excellent (we'll pause at 5%)
 * - Complaint rate: <0.1% (1 per 1000) is acceptable, ISPs can defer at 0.01% (we'll pause at 0.1%)
 * - Engagement: >20% open rate is good
 */
export const REPUTATION_THRESHOLDS = {
  // Auto-pause thresholds (conservative to protect users)
  BOUNCE_RATE_PAUSE: 0.05, // 5% - pause sending if bounce rate exceeds this
  COMPLAINT_RATE_PAUSE: 0.001, // 0.1% - pause sending if complaint rate exceeds this
  
  // Warning thresholds (alert user but don't pause)
  BOUNCE_RATE_WARNING: 0.03, // 3% - warn user
  COMPLAINT_RATE_WARNING: 0.0005, // 0.05% - warn user
  
  // Good thresholds (for reputation scoring)
  BOUNCE_RATE_EXCELLENT: 0.02, // 2% - excellent bounce rate
  COMPLAINT_RATE_EXCELLENT: 0.0001, // 0.01% - excellent complaint rate
  ENGAGEMENT_RATE_GOOD: 0.20, // 20% - good engagement rate
};

export interface DomainReputationData {
  id?: number;
  userId: number;
  domain: string;
  reputationScore: number;
  status: 'active' | 'paused' | 'warning';
  bounceRate: number;
  complaintRate: number;
  engagementRate: number;
  totalSent: number;
  totalBounced: number;
  totalComplained: number;
  totalOpened: number;
  totalClicked: number;
  lastCalculatedAt?: Date;
  pausedAt?: Date;
  pausedReason?: string;
  googlePostmasterData?: any;
}

export class DomainReputationService {
  /**
   * Validate input parameters
   */
  private validateInputs(userId: number, domain: string): void {
    if (!userId || userId <= 0 || !Number.isInteger(userId)) {
      throw new Error('Invalid userId: must be a positive integer');
    }
    if (!domain || typeof domain !== 'string' || domain.trim().length === 0) {
      throw new Error('Invalid domain: must be a non-empty string');
    }
    // Basic domain format validation (simple check for valid domain pattern)
    const domainPattern = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
    if (!domainPattern.test(domain.trim())) {
      throw new Error(`Invalid domain format: ${domain}`);
    }
  }

  /**
   * Get or create reputation record for a domain
   */
  async getOrCreateReputation(userId: number, domain: string): Promise<DomainReputationData> {
    this.validateInputs(userId, domain);
    const normalizedDomain = domain.trim().toLowerCase();

    try {
      const result = await pool.query(
        `SELECT * FROM domain_reputation WHERE user_id = $1 AND domain = $2`,
        [userId, normalizedDomain]
      );

      if (result.rows.length > 0) {
        return this.mapRowToReputation(result.rows[0]);
      }

      // Create new reputation record
      const insertResult = await pool.query(
        `INSERT INTO domain_reputation (user_id, domain, reputation_score, status)
         VALUES ($1, $2, 100, 'active')
         RETURNING *`,
        [userId, normalizedDomain]
      );

      if (insertResult.rows.length === 0) {
        throw new Error('Failed to create reputation record');
      }

      return this.mapRowToReputation(insertResult.rows[0]);
    } catch (error: any) {
      if (error.message.includes('Invalid')) {
        throw error; // Re-throw validation errors
      }
      console.error(`[DomainReputation] Error in getOrCreateReputation for domain ${normalizedDomain}:`, error?.message || error);
      throw new Error(`Failed to get or create reputation: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Calculate reputation metrics from email events
   * This should be called periodically (e.g., every hour) to update reputation
   */
  async calculateReputation(userId: number, domain: string): Promise<DomainReputationData> {
    this.validateInputs(userId, domain);
    const normalizedDomain = domain.trim().toLowerCase();

    try {
      // Get all email events for this domain in the last 30 days
      const eventsResult = await pool.query(
        `SELECT 
        COUNT(DISTINCT CASE WHEN eq.status = 'sent' THEN eq.id END) as total_sent,
        COUNT(DISTINCT CASE WHEN e.event_type = 'bounced' THEN e.email_queue_id END) as total_bounced,
        COUNT(DISTINCT CASE WHEN e.event_type = 'complained' THEN e.email_queue_id END) as total_complained,
        COUNT(DISTINCT CASE WHEN e.event_type = 'opened' THEN e.email_queue_id END) as total_opened,
        COUNT(DISTINCT CASE WHEN e.event_type = 'clicked' THEN e.email_queue_id END) as total_clicked
       FROM email_queue eq
       LEFT JOIN email_events e ON e.email_queue_id = eq.id
       WHERE eq.user_id = $1 
         AND eq.from_email LIKE $2::text
         AND eq.created_at >= NOW() - INTERVAL '30 days'`,
        [userId, `%@${normalizedDomain}`]
      );

    const stats = eventsResult.rows[0] || {};
    const totalSent = parseInt(stats.total_sent || '0');
    const totalBounced = parseInt(stats.total_bounced || '0');
    const totalComplained = parseInt(stats.total_complained || '0');
    const totalOpened = parseInt(stats.total_opened || '0');
    const totalClicked = parseInt(stats.total_clicked || '0');

    // Calculate rates
    const bounceRate = totalSent > 0 ? totalBounced / totalSent : 0;
    const complaintRate = totalSent > 0 ? totalComplained / totalSent : 0;
    const engagementRate = totalSent > 0 ? (totalOpened + totalClicked) / totalSent : 0;

    // Calculate reputation score (0-100)
    let reputationScore = 100;

    // Deduct points for bounces (max -50 points)
    if (bounceRate > REPUTATION_THRESHOLDS.BOUNCE_RATE_EXCELLENT) {
      const excessBounceRate = bounceRate - REPUTATION_THRESHOLDS.BOUNCE_RATE_EXCELLENT;
      reputationScore -= Math.min(50, excessBounceRate * 1000); // -1 point per 0.1% excess
    }

    // Deduct points for complaints (max -30 points)
    if (complaintRate > REPUTATION_THRESHOLDS.COMPLAINT_RATE_EXCELLENT) {
      const excessComplaintRate = complaintRate - REPUTATION_THRESHOLDS.COMPLAINT_RATE_EXCELLENT;
      reputationScore -= Math.min(30, excessComplaintRate * 100000); // -1 point per 0.01% excess
    }

    // Add points for engagement (max +20 points)
    if (engagementRate > REPUTATION_THRESHOLDS.ENGAGEMENT_RATE_GOOD) {
      const excessEngagement = engagementRate - REPUTATION_THRESHOLDS.ENGAGEMENT_RATE_GOOD;
      reputationScore += Math.min(20, excessEngagement * 100); // +1 point per 1% excess
    }

    reputationScore = Math.max(0, Math.min(100, reputationScore));

    // Determine status
    let status: 'active' | 'paused' | 'warning' = 'active';
    let pausedReason: string | undefined;

    if (bounceRate >= REPUTATION_THRESHOLDS.BOUNCE_RATE_PAUSE || 
        complaintRate >= REPUTATION_THRESHOLDS.COMPLAINT_RATE_PAUSE) {
      status = 'paused';
      pausedReason = bounceRate >= REPUTATION_THRESHOLDS.BOUNCE_RATE_PAUSE
        ? `Bounce rate (${(bounceRate * 100).toFixed(2)}%) exceeds safe threshold (5%)`
        : `Complaint rate (${(complaintRate * 100).toFixed(3)}%) exceeds safe threshold (0.1%)`;
    } else if (bounceRate >= REPUTATION_THRESHOLDS.BOUNCE_RATE_WARNING ||
               complaintRate >= REPUTATION_THRESHOLDS.COMPLAINT_RATE_WARNING) {
      status = 'warning';
    }

    // Update reputation record
    const updateResult = await pool.query(
      `UPDATE domain_reputation 
       SET reputation_score = $1,
           status = $2,
           bounce_rate = $3,
           complaint_rate = $4,
           engagement_rate = $5,
           total_sent = $6,
           total_bounced = $7,
           total_complained = $8,
           total_opened = $9,
           total_clicked = $10,
           last_calculated_at = CURRENT_TIMESTAMP,
           paused_at = CASE WHEN $2 = 'paused' AND paused_at IS NULL THEN CURRENT_TIMESTAMP ELSE paused_at END,
           paused_reason = CASE WHEN $2 = 'paused' THEN $11 ELSE NULL END,
           updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $12 AND domain = $13
       RETURNING *`,
        [
          reputationScore,
          status,
          bounceRate,
          complaintRate,
          engagementRate,
          totalSent,
          totalBounced,
          totalComplained,
          totalOpened,
          totalClicked,
          pausedReason,
          userId,
          normalizedDomain,
        ]
      );

    if (updateResult.rows.length === 0) {
      // Create if doesn't exist
      const createResult = await pool.query(
        `INSERT INTO domain_reputation 
         (user_id, domain, reputation_score, status, bounce_rate, complaint_rate, engagement_rate,
          total_sent, total_bounced, total_complained, total_opened, total_clicked, paused_reason, paused_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 
                 CASE WHEN $4 = 'paused' THEN CURRENT_TIMESTAMP ELSE NULL END)
         RETURNING *`,
          [
            userId,
            normalizedDomain,
            reputationScore,
            status,
            bounceRate,
            complaintRate,
            engagementRate,
            totalSent,
            totalBounced,
            totalComplained,
            totalOpened,
            totalClicked,
            pausedReason,
          ]
        );
        if (createResult.rows.length === 0) {
          throw new Error('Failed to create reputation record');
        }
        return this.mapRowToReputation(createResult.rows[0]);
      }

      if (updateResult.rows.length === 0) {
        throw new Error('Failed to update reputation record');
      }

      return this.mapRowToReputation(updateResult.rows[0]);
    } catch (error: any) {
      if (error.message.includes('Invalid')) {
        throw error; // Re-throw validation errors
      }
      console.error(`[DomainReputation] Error calculating reputation for domain ${normalizedDomain}:`, error?.message || error);
      throw new Error(`Failed to calculate reputation: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Check if domain can send emails (not paused)
   */
  async canSend(userId: number, domain: string): Promise<{ canSend: boolean; reason?: string }> {
    this.validateInputs(userId, domain);
    const normalizedDomain = domain.trim().toLowerCase();

    try {
      const reputation = await this.getOrCreateReputation(userId, normalizedDomain);
      
      if (reputation.status === 'paused') {
        return {
          canSend: false,
          reason: reputation.pausedReason || 'Domain reputation is paused',
        };
      }

      return { canSend: true };
    } catch (error: any) {
      console.error(`[DomainReputation] Error checking canSend for domain ${normalizedDomain}:`, error?.message || error);
      // Fail closed for safety - if we can't check reputation, don't allow sending
      return {
        canSend: false,
        reason: `Unable to verify domain reputation: ${error?.message || 'Unknown error'}`,
      };
    }
  }

  /**
   * Get reputation status for a domain
   */
  async getReputation(userId: number, domain: string): Promise<DomainReputationData | null> {
    this.validateInputs(userId, domain);
    const normalizedDomain = domain.trim().toLowerCase();

    try {
      const result = await pool.query(
        `SELECT * FROM domain_reputation WHERE user_id = $1 AND domain = $2`,
        [userId, normalizedDomain]
      );

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapRowToReputation(result.rows[0]);
    } catch (error: any) {
      console.error(`[DomainReputation] Error getting reputation for domain ${normalizedDomain}:`, error?.message || error);
      throw new Error(`Failed to get reputation: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Manually resume sending for a paused domain
   */
  async resumeSending(userId: number, domain: string): Promise<void> {
    this.validateInputs(userId, domain);
    const normalizedDomain = domain.trim().toLowerCase();

    try {
      const result = await pool.query(
        `UPDATE domain_reputation 
         SET status = 'active', paused_at = NULL, paused_reason = NULL, updated_at = CURRENT_TIMESTAMP
         WHERE user_id = $1 AND domain = $2
         RETURNING id`,
        [userId, normalizedDomain]
      );

      if (result.rows.length === 0) {
        throw new Error(`No reputation record found for domain ${normalizedDomain}`);
      }
    } catch (error: any) {
      if (error.message.includes('Invalid') || error.message.includes('No reputation record')) {
        throw error; // Re-throw validation/not found errors
      }
      console.error(`[DomainReputation] Error resuming sending for domain ${normalizedDomain}:`, error?.message || error);
      throw new Error(`Failed to resume sending: ${error?.message || 'Unknown error'}`);
    }
  }

  /**
   * Fetch Google Postmaster Tools data (optional - requires domain verification)
   * This is a placeholder - Google Postmaster Tools requires OAuth and domain verification
   * Users can optionally connect their Google account to get additional reputation data
   */
  async fetchGooglePostmasterData(_userId: number, domain: string): Promise<void> {
    // TODO: Implement Google Postmaster Tools API integration
    // Requires:
    // 1. OAuth setup with Google
    // 2. Domain verification in Google Postmaster Tools
    // 3. API access token
    // 
    // For now, this is a placeholder - the reputation calculation uses email_events data
    // which is more reliable and doesn't require external API setup
    
    console.log(`[Google Postmaster] Placeholder for domain ${domain} - integration can be added later`);
  }

  /**
   * Map database row to DomainReputationData
   * Validates and sanitizes data from database
   */
  private mapRowToReputation(row: any): DomainReputationData {
    if (!row) {
      throw new Error('Cannot map null or undefined row');
    }

    // Validate required fields
    if (row.user_id === undefined || row.domain === undefined) {
      throw new Error('Invalid row: missing required fields (user_id, domain)');
    }

    // Validate status enum
    const validStatuses = ['active', 'paused', 'warning'];
    if (row.status && !validStatuses.includes(row.status)) {
      throw new Error(`Invalid status: ${row.status}. Must be one of: ${validStatuses.join(', ')}`);
    }

    // Validate reputation score range
    const reputationScore = row.reputation_score ?? 100;
    if (reputationScore < 0 || reputationScore > 100) {
      throw new Error(`Invalid reputation_score: ${reputationScore}. Must be between 0 and 100`);
    }

    return {
      id: row.id,
      userId: row.user_id,
      domain: row.domain,
      reputationScore: reputationScore,
      status: (row.status || 'active') as 'active' | 'paused' | 'warning',
      bounceRate: parseFloat(String(row.bounce_rate || '0')) || 0,
      complaintRate: parseFloat(String(row.complaint_rate || '0')) || 0,
      engagementRate: parseFloat(String(row.engagement_rate || '0')) || 0,
      totalSent: parseInt(String(row.total_sent || '0'), 10) || 0,
      totalBounced: parseInt(String(row.total_bounced || '0'), 10) || 0,
      totalComplained: parseInt(String(row.total_complained || '0'), 10) || 0,
      totalOpened: parseInt(String(row.total_opened || '0'), 10) || 0,
      totalClicked: parseInt(String(row.total_clicked || '0'), 10) || 0,
      lastCalculatedAt: row.last_calculated_at ? new Date(row.last_calculated_at) : undefined,
      pausedAt: row.paused_at ? new Date(row.paused_at) : undefined,
      pausedReason: row.paused_reason || undefined,
      googlePostmasterData: row.google_postmaster_data || undefined,
    };
  }
}

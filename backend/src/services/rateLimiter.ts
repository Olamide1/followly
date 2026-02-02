import { getRedisClient } from './redis';
import { DomainReputationService } from './domainReputation';
import { WarmupService } from './warmup';

export interface RateLimitConfig {
  maxEmailsPerHour?: number; // Optional override - will be calculated based on reputation/warmup if not provided
  domain?: string; // Optional: specific domain limit override
  userId?: number; // Required for dynamic limit calculation
  provider?: string; // Required for warmup-based limits
}

/**
 * Rate limiting service to prevent hitting SMTP provider limits
 * Tracks emails per domain per hour to avoid exceeding provider rate limits
 */
export class RateLimiterService {
  /**
   * Validate input parameters
   */
  private validateInputs(domain: string, userId?: number, provider?: string): void {
    if (!domain || typeof domain !== 'string' || domain.trim().length === 0) {
      throw new Error('Invalid domain: must be a non-empty string');
    }
    if (userId !== undefined && (userId <= 0 || !Number.isInteger(userId))) {
      throw new Error('Invalid userId: must be a positive integer');
    }
    if (provider !== undefined && (!provider || typeof provider !== 'string' || provider.trim().length === 0)) {
      throw new Error('Invalid provider: must be a non-empty string');
    }
  }

  /**
   * Calculate dynamic rate limit based on reputation and warmup status
   * Limits are visible to users and adjust automatically
   */
  private async calculateDynamicLimit(domain: string, userId?: number, provider?: string): Promise<number> {
    this.validateInputs(domain, userId, provider);
    const normalizedDomain = domain.trim().toLowerCase();
    // Base limits by provider type
    const baseLimits: Record<string, number> = {
      resend: 100, // ESPs have higher limits
      brevo: 100,
      mailjet: 100,
      nodemailer: 60, // SMTP is more conservative
    };

    let limit = baseLimits[provider || 'nodemailer'] || 60;

    // Adjust based on reputation if available
    if (userId) {
      try {
        const reputationService = new DomainReputationService();
        const reputation = await reputationService.getReputation(userId, normalizedDomain);
        
        if (reputation) {
          // Reduce limit if reputation is poor
          if (reputation.status === 'warning') {
            limit = Math.floor(limit * 0.7); // 30% reduction
          } else if (reputation.status === 'paused') {
            limit = 0; // Can't send if paused
          } else if (reputation.reputationScore < 70) {
            limit = Math.floor(limit * 0.8); // 20% reduction for low reputation
          } else if (reputation.reputationScore >= 90) {
            limit = Math.floor(limit * 1.2); // 20% increase for excellent reputation
          }
        }

        // Adjust based on warmup status
        if (provider) {
          try {
            const warmupService = new WarmupService();
            const schedule = await warmupService.getWarmupSchedule(userId, normalizedDomain, provider);
            
            if (schedule) {
              // During warmup, use daily limit divided by 24 (approximate hourly limit)
              const dailyLimit = await warmupService.getDailyLimit(userId, normalizedDomain, provider);
              const warmupHourlyLimit = Math.max(1, Math.floor(dailyLimit / 24));
              limit = Math.min(limit, warmupHourlyLimit); // Use the more restrictive limit
            }
          } catch (error: any) {
            // Log but continue - warmup errors shouldn't break rate limiting
            console.warn(`[RateLimiter] Error getting warmup schedule:`, error?.message || error);
          }
        }
      } catch (error: any) {
        // Log but continue - reputation errors shouldn't break rate limiting
        console.warn(`[RateLimiter] Error getting reputation:`, error?.message || error);
      }
    }

    return Math.max(1, limit); // Minimum 1 email/hour
  }

  /**
   * Check if we can send an email for a given domain
   * @param domain The sending domain (extracted from fromEmail)
   * @param config Optional rate limit configuration (will calculate dynamically if not provided)
   * @returns Object with canSend boolean and timeUntilReset in milliseconds
   */
  async canSend(domain: string, config?: RateLimitConfig): Promise<{ canSend: boolean; timeUntilReset: number; currentCount: number; limit: number }> {
    try {
      this.validateInputs(domain, config?.userId, config?.provider);
      const normalizedDomain = domain.trim().toLowerCase();
      const redis = getRedisClient();
      
      // Calculate dynamic limit if userId and provider provided, otherwise use config or default
      const limit = config?.maxEmailsPerHour || 
        (config?.userId && config?.provider 
          ? await this.calculateDynamicLimit(normalizedDomain, config.userId, config.provider)
          : 60);
      
      if (limit <= 0) {
        // Domain is paused or has zero limit
        return {
          canSend: false,
          timeUntilReset: 0,
          currentCount: 0,
          limit: 0,
        };
      }
      
      // Get current hour timestamp (e.g., "2026-01-27T14")
      const now = new Date();
      const hourKey = now.toISOString().split(':')[0]; // Format: YYYY-MM-DDTHH
      const redisKey = `rate_limit:${normalizedDomain}:${hourKey}`;
      
      // Get current count
      const currentCount = await redis.get(redisKey);
      const count = currentCount ? parseInt(currentCount, 10) : 0;
      
      // Calculate time until next hour (when limit resets)
      const nextHour = new Date(now);
      nextHour.setHours(nextHour.getHours() + 1);
      nextHour.setMinutes(0);
      nextHour.setSeconds(0);
      nextHour.setMilliseconds(0);
      const timeUntilReset = nextHour.getTime() - now.getTime();
      
      return {
        canSend: count < limit,
        timeUntilReset,
        currentCount: count,
        limit,
      };
    } catch (error: any) {
      // If Redis fails, allow sending (fail open) but log error
      console.error(`[RateLimiter] Error checking rate limit for domain ${domain}:`, error?.message || error);
      return {
        canSend: true, // Fail open - don't block emails if rate limiter fails
        timeUntilReset: 0,
        currentCount: 0,
        limit: config?.maxEmailsPerHour || 60,
      };
    }
  }

  /**
   * Record that an email was sent for a domain
   * @param domain The sending domain
   * @param config Optional rate limit configuration
   */
  async recordSend(domain: string, config?: RateLimitConfig): Promise<void> {
    try {
      this.validateInputs(domain, config?.userId, config?.provider);
      const normalizedDomain = domain.trim().toLowerCase();
      const redis = getRedisClient();
      
      // Calculate dynamic limit if needed
      const limit = config?.maxEmailsPerHour || 
        (config?.userId && config?.provider 
          ? await this.calculateDynamicLimit(normalizedDomain, config.userId, config.provider)
          : 60);
      
      // Get current hour timestamp
      const now = new Date();
      const hourKey = now.toISOString().split(':')[0];
      const redisKey = `rate_limit:${normalizedDomain}:${hourKey}`;
      
      // Increment count and set expiration (expires after 2 hours to be safe)
      await redis.multi()
        .incr(redisKey)
        .expire(redisKey, 7200) // 2 hours expiration
        .exec();
      
      // Log if approaching limit (warn at 80% and 95%)
      const currentCount = await redis.get(redisKey);
      const count = currentCount ? parseInt(currentCount, 10) : 0;
      
      if (count >= limit * 0.95) {
        console.warn(`[RateLimiter] Domain ${domain} is at ${count}/${limit} (${Math.round((count/limit)*100)}%) - approaching hourly limit!`);
      } else if (count >= limit * 0.8) {
        console.log(`[RateLimiter] Domain ${domain} is at ${count}/${limit} (${Math.round((count/limit)*100)}%) - rate limit warning`);
      }
    } catch (error: any) {
      // Don't throw - rate limiting failures shouldn't block email sending
      console.error(`[RateLimiter] Error recording send for domain ${domain}:`, error?.message || error);
    }
  }

  /**
   * Get current rate limit status for a domain
   * Includes dynamic limit calculation based on reputation and warmup
   * @param domain The sending domain
   * @param userId Optional - if provided, calculates dynamic limits
   * @param provider Optional - if provided, considers warmup status
   */
  async getStatus(domain: string, userId?: number, provider?: string): Promise<{ currentCount: number; limit: number; timeUntilReset: number; percentageUsed: number }> {
    try {
      this.validateInputs(domain, userId, provider);
      const normalizedDomain = domain.trim().toLowerCase();
      const redis = getRedisClient();
      
      // Calculate dynamic limit if userId and provider provided
      const limit = userId && provider 
        ? await this.calculateDynamicLimit(normalizedDomain, userId, provider)
        : 60; // Default limit
      
      const now = new Date();
      const hourKey = now.toISOString().split(':')[0];
      const redisKey = `rate_limit:${normalizedDomain}:${hourKey}`;
      
      const currentCount = await redis.get(redisKey);
      const count = currentCount ? parseInt(currentCount, 10) : 0;
      
      const nextHour = new Date(now);
      nextHour.setHours(nextHour.getHours() + 1);
      nextHour.setMinutes(0);
      nextHour.setSeconds(0);
      nextHour.setMilliseconds(0);
      const timeUntilReset = nextHour.getTime() - now.getTime();
      
      return {
        currentCount: count,
        limit,
        timeUntilReset,
        percentageUsed: Math.round((count / limit) * 100),
      };
    } catch (error: any) {
      console.error(`[RateLimiter] Error getting status for domain ${domain}:`, error?.message || error);
      return {
        currentCount: 0,
        limit: 60,
        timeUntilReset: 0,
        percentageUsed: 0,
      };
    }
  }
}

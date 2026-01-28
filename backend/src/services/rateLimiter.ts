import { getRedisClient } from './redis';

export interface RateLimitConfig {
  maxEmailsPerHour: number; // Default: 60
  domain?: string; // Optional: specific domain limit override
}

/**
 * Rate limiting service to prevent hitting SMTP provider limits
 * Tracks emails per domain per hour to avoid exceeding provider rate limits
 */
export class RateLimiterService {
  /**
   * Check if we can send an email for a given domain
   * @param domain The sending domain (extracted from fromEmail)
   * @param config Optional rate limit configuration (defaults to 60/hour)
   * @returns Object with canSend boolean and timeUntilReset in milliseconds
   */
  async canSend(domain: string, config?: RateLimitConfig): Promise<{ canSend: boolean; timeUntilReset: number; currentCount: number; limit: number }> {
    try {
      const redis = getRedisClient();
      const limit = config?.maxEmailsPerHour || 60; // Default: 60 emails/hour
      
      // Get current hour timestamp (e.g., "2026-01-27T14")
      const now = new Date();
      const hourKey = now.toISOString().split(':')[0]; // Format: YYYY-MM-DDTHH
      const redisKey = `rate_limit:${domain}:${hourKey}`;
      
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
      const redis = getRedisClient();
      const limit = config?.maxEmailsPerHour || 60;
      
      // Get current hour timestamp
      const now = new Date();
      const hourKey = now.toISOString().split(':')[0];
      const redisKey = `rate_limit:${domain}:${hourKey}`;
      
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
   * Useful for monitoring and debugging
   */
  async getStatus(domain: string): Promise<{ currentCount: number; limit: number; timeUntilReset: number; percentageUsed: number }> {
    try {
      const redis = getRedisClient();
      const limit = 60; // Default limit
      
      const now = new Date();
      const hourKey = now.toISOString().split(':')[0];
      const redisKey = `rate_limit:${domain}:${hourKey}`;
      
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

import { getRedisClient } from './redis';
import { DomainReputationService } from './domainReputation';
import { WarmupService } from './warmup';

/**
 * Per-recipient-domain hourly limits to prevent cPanel 421 defers
 * cPanel allows only 5 defers/hour per sending domain. When we send many emails
 * to Gmail too fast, Gmail rejects with 421 (Connection limits exceeded), each
 * counting as a "defer" in cPanel. These limits prevent that burst.
 */
const RECIPIENT_DOMAIN_LIMITS: Record<string, number> = {
  'gmail.com': 5,
  'googlemail.com': 5,
  'yahoo.com': 8,
  'yahoo.co.uk': 8,
  'ymail.com': 8,
  'outlook.com': 10,
  'hotmail.com': 10,
  'live.com': 10,
  'aol.com': 10,
};
const DEFAULT_RECIPIENT_DOMAIN_LIMIT = 15;

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
    // These are maximum hourly limits - actual limits may be lower during warmup
    const baseLimits: Record<string, number> = {
      resend: 100, // ESPs have higher limits
      brevo: 100,
      mailjet: 100,
      nodemailer: 20, // Very conservative for cPanel SMTP - prevents 421 defers
      // cPanel allows only 5 defers/hour per domain, so 20/hour keeps well under tolerance
      // Note: Warmup will still restrict this to daily limit / 12 (2-hour windows)
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
              // During warmup, calculate hourly limit from daily limit
              // Use daily limit divided by 12 (2-hour windows) for better distribution
              // This allows more reasonable sending rates while still respecting daily limits
              // Example: 50/day / 12 = ~4/hour (much better than 50/24 = 2/hour)
              const dailyLimit = await warmupService.getDailyLimit(userId, normalizedDomain, provider);
              // Minimum 2 emails/hour during warmup (prevents 1/hour bottleneck)
              // Maximum based on daily limit distributed across 12 2-hour windows
              const warmupHourlyLimit = Math.max(2, Math.floor(dailyLimit / 12));
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
   * Atomic Lua script to check and reserve a rate limit slot
   * Returns: [canSend (1 or 0), newCount, limit]
   * This prevents race conditions where multiple jobs check simultaneously
   */
  private getCheckAndReserveScript(): string {
    return `
      local key = KEYS[1]
      local limit = tonumber(ARGV[1])
      local expire = tonumber(ARGV[2])
      
      local current = redis.call('GET', key)
      local count = current and tonumber(current) or 0
      
      if count < limit then
        -- Under limit: increment and return success
        local newCount = redis.call('INCR', key)
        redis.call('EXPIRE', key, expire)
        return {1, newCount, limit}
      else
        -- At or over limit: return failure without incrementing
        return {0, count, limit}
      end
    `;
  }

  /**
   * Execute Lua script using node-redis v4+ API
   * Falls back to non-atomic check if script execution fails
   */
  private async executeAtomicCheck(
    redis: any,
    script: string,
    redisKey: string,
    limit: number
  ): Promise<{ canSend: boolean; currentCount: number }> {
    try {
      // Try to use eval with options object (node-redis v4+ format)
      // The exact API may vary, so we'll try multiple formats
      let result: [number, number, number];
      
      try {
        // Try format: eval(script, { keys: [...], arguments: [...] })
        result = await redis.eval(script, {
          keys: [redisKey],
          arguments: [limit.toString(), '7200'],
        }) as [number, number, number];
      } catch (formatError: any) {
        // Fallback: try traditional format eval(script, numKeys, ...keys, ...args)
        try {
          result = await redis.eval(
            script,
            1,
            redisKey,
            limit.toString(),
            '7200'
          ) as [number, number, number];
        } catch (fallbackError: any) {
          // If both fail, fall back to non-atomic check
          console.warn(`[RateLimiter] Lua script execution failed, using non-atomic check:`, fallbackError?.message);
          const currentCount = await redis.get(redisKey);
          const count = currentCount ? parseInt(currentCount, 10) : 0;
          return {
            canSend: count < limit,
            currentCount: count,
          };
        }
      }
      
      return {
        canSend: result[0] === 1,
        currentCount: result[1],
      };
    } catch (error: any) {
      // Fall back to non-atomic check if script fails
      console.warn(`[RateLimiter] Lua script execution failed, using non-atomic check:`, error?.message);
      const currentCount = await redis.get(redisKey);
      const count = currentCount ? parseInt(currentCount, 10) : 0;
      return {
        canSend: count < limit,
        currentCount: count,
      };
    }
  }

  /**
   * Check if we can send an email for a given domain (atomic check-and-reserve)
   * This uses a Lua script to atomically check and reserve a slot, preventing race conditions
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
      
      // Use atomic Lua script to check and reserve a slot
      // This prevents race conditions where multiple jobs check simultaneously
      const script = this.getCheckAndReserveScript();
      const atomicResult = await this.executeAtomicCheck(redis, script, redisKey, limit);
      
      const canSend = atomicResult.canSend;
      const currentCount = atomicResult.currentCount;
      const actualLimit = limit;
      
      // If atomic check succeeded and we can send, the counter was already incremented
      // If atomic check failed, increment manually (fallback to non-atomic)
      if (canSend && atomicResult.currentCount > 0) {
        // Counter was incremented by Lua script, ensure expiration is set
        try {
          await redis.expire(redisKey, 7200);
        } catch (expireError: any) {
          // Ignore expiration errors
        }
      } else if (canSend) {
        // Fallback: non-atomic increment (shouldn't happen if script worked)
        try {
          await redis.multi()
            .incr(redisKey)
            .expire(redisKey, 7200)
            .exec();
        } catch (incrError: any) {
          console.warn(`[RateLimiter] Failed to increment counter:`, incrError?.message);
        }
      }
      
      // Calculate time until next hour (when limit resets)
      const nextHour = new Date(now);
      nextHour.setHours(nextHour.getHours() + 1);
      nextHour.setMinutes(0);
      nextHour.setSeconds(0);
      nextHour.setMilliseconds(0);
      const timeUntilReset = nextHour.getTime() - now.getTime();
      
      // Log if approaching or at limit
      if (!canSend) {
        console.warn(
          `[RateLimiter] Domain ${domain} rate limit reached: ${currentCount}/${actualLimit} emails/hour. ` +
          `Email will be delayed until limit resets.`
        );
      } else if (currentCount >= actualLimit * 0.95) {
        console.warn(`[RateLimiter] Domain ${domain} is at ${currentCount}/${actualLimit} (${Math.round((currentCount/actualLimit)*100)}%) - approaching hourly limit!`);
      } else if (currentCount >= actualLimit * 0.8) {
        console.log(`[RateLimiter] Domain ${domain} is at ${currentCount}/${actualLimit} (${Math.round((currentCount/actualLimit)*100)}%) - rate limit warning`);
      }
      
      return {
        canSend,
        timeUntilReset,
        currentCount,
        limit: actualLimit,
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
   * NOTE: The actual rate limit increment happens atomically in canSend() via the Lua script.
   * This method is kept for backwards compatibility and only performs logging.
   * It does NOT increment the counter again to avoid double-counting.
   * @param domain The sending domain
   * @param config Optional rate limit configuration
   */
  async recordSend(domain: string, config?: RateLimitConfig): Promise<void> {
    try {
      this.validateInputs(domain, config?.userId, config?.provider);
      const normalizedDomain = domain.trim().toLowerCase();
      const redis = getRedisClient();
      
      // Calculate dynamic limit if needed (for logging purposes)
      const limit = config?.maxEmailsPerHour || 
        (config?.userId && config?.provider 
          ? await this.calculateDynamicLimit(normalizedDomain, config.userId, config.provider)
          : 60);
      
      // Get current hour timestamp
      const now = new Date();
      const hourKey = now.toISOString().split(':')[0];
      const redisKey = `rate_limit:${normalizedDomain}:${hourKey}`;
      
      // Get current count for logging (count was already incremented atomically in canSend())
      const currentCount = await redis.get(redisKey);
      const count = currentCount ? parseInt(currentCount, 10) : 0;
      
      // Log if approaching limit (warn at 80% and 95%)
      // Note: Logging is already done in canSend(), but we keep this for consistency
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

  /**
   * Check if we can send to a specific recipient domain (e.g., gmail.com)
   * Prevents bursting emails to Gmail/Yahoo/etc. which causes cPanel 421 defers
   * Uses the same atomic Lua script as canSend() to prevent race conditions
   * @param recipientDomain The domain part of the recipient email (e.g., "gmail.com")
   * @param senderDomain The sending domain (for composite Redis key)
   * @returns Object with canSend boolean and timing info
   */
  async canSendToRecipientDomain(
    recipientDomain: string,
    senderDomain: string
  ): Promise<{ canSend: boolean; timeUntilReset: number; currentCount: number; limit: number }> {
    try {
      const normalizedRecipientDomain = recipientDomain.trim().toLowerCase();
      const normalizedSenderDomain = senderDomain.trim().toLowerCase();
      const redis = getRedisClient();

      const limit = RECIPIENT_DOMAIN_LIMITS[normalizedRecipientDomain] || DEFAULT_RECIPIENT_DOMAIN_LIMIT;

      const now = new Date();
      const hourKey = now.toISOString().split(':')[0];
      const redisKey = `recipient_rate_limit:${normalizedSenderDomain}:${normalizedRecipientDomain}:${hourKey}`;

      // Use atomic Lua script to check and reserve a slot (same pattern as canSend)
      const script = this.getCheckAndReserveScript();
      const atomicResult = await this.executeAtomicCheck(redis, script, redisKey, limit);

      if (atomicResult.canSend && atomicResult.currentCount > 0) {
        try {
          await redis.expire(redisKey, 7200);
        } catch (expireError: any) {
          // Ignore expiration errors
        }
      } else if (atomicResult.canSend) {
        try {
          await redis.multi()
            .incr(redisKey)
            .expire(redisKey, 7200)
            .exec();
        } catch (incrError: any) {
          console.warn(`[RateLimiter] Failed to increment recipient domain counter:`, incrError?.message);
        }
      }

      // Calculate time until next hour
      const nextHour = new Date(now);
      nextHour.setHours(nextHour.getHours() + 1);
      nextHour.setMinutes(0);
      nextHour.setSeconds(0);
      nextHour.setMilliseconds(0);
      const timeUntilReset = nextHour.getTime() - now.getTime();

      if (!atomicResult.canSend) {
        console.warn(
          `[RateLimiter] Recipient domain ${normalizedRecipientDomain} rate limit reached: ` +
          `${atomicResult.currentCount}/${limit} emails/hour from ${normalizedSenderDomain}. ` +
          `Email will be delayed to prevent cPanel 421 defers.`
        );
      }

      return {
        canSend: atomicResult.canSend,
        timeUntilReset,
        currentCount: atomicResult.currentCount,
        limit,
      };
    } catch (error: any) {
      // Fail open - don't block emails if recipient rate limiter fails
      console.error(`[RateLimiter] Error checking recipient domain rate limit:`, error?.message || error);
      return {
        canSend: true,
        timeUntilReset: 0,
        currentCount: 0,
        limit: DEFAULT_RECIPIENT_DOMAIN_LIMIT,
      };
    }
  }
}

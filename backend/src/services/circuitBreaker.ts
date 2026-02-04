import { getRedisClient } from './redis';

export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of consecutive failures before opening circuit
  authFailureThreshold: number; // Number of EAUTH failures before opening circuit (lower threshold - early warning)
  resetTimeout: number; // Time in ms before attempting to reset circuit
}

/**
 * Circuit breaker service to prevent sending emails when account/domain issues are detected
 * Tracks consecutive failures per domain and pauses sending when threshold is reached
 * This prevents account locking and domain blocking by stopping early
 */
export class CircuitBreakerService {
  private defaultConfig: CircuitBreakerConfig = {
    failureThreshold: 3, // Open circuit after 3 consecutive critical failures
    authFailureThreshold: 2, // Open circuit after 2 EAUTH failures (early warning - auth issues often precede locks)
    resetTimeout: 60 * 60 * 1000, // 1 hour before attempting reset
  };

  /**
   * Check if circuit is open (paused) for a domain
   * @param domain The sending domain
   * @returns Object with isOpen boolean and reason if open
   */
  async isCircuitOpen(domain: string): Promise<{ isOpen: boolean; reason?: string; resetAt?: Date }> {
    try {
      const normalizedDomain = domain.trim().toLowerCase();
      const redis = getRedisClient();
      const circuitKey = `circuit_breaker:${normalizedDomain}`;
      
      const circuitData = await redis.get(circuitKey);
      if (!circuitData) {
        return { isOpen: false };
      }

      const data = JSON.parse(circuitData);
      const resetAt = new Date(data.resetAt);
      
      // Check if reset time has passed
      if (Date.now() >= resetAt.getTime()) {
        // Circuit should reset - clear it
        await redis.del(circuitKey);
        return { isOpen: false };
      }

      return {
        isOpen: true,
        reason: data.reason || 'Circuit breaker opened due to consecutive failures',
        resetAt,
      };
    } catch (error: any) {
      // If Redis fails, fail closed (don't block sending)
      console.error(`[CircuitBreaker] Error checking circuit for domain ${domain}:`, error?.message || error);
      return { isOpen: false };
    }
  }

  /**
   * Record an EAUTH failure (authentication error - early warning sign)
   * Opens circuit at lower threshold since auth failures often precede account locks
   * @param domain The sending domain
   * @param reason Reason for the failure
   */
  async recordAuthFailure(domain: string, reason: string = 'SMTP authentication failed'): Promise<void> {
    try {
      const normalizedDomain = domain.trim().toLowerCase();
      const redis = getRedisClient();
      const authFailureKey = `circuit_auth_failures:${normalizedDomain}`;
      const circuitKey = `circuit_breaker:${normalizedDomain}`;
      
      // Increment auth failure count
      const authFailureCount = await redis.incr(authFailureKey);
      await redis.expire(authFailureKey, 3600); // Expire after 1 hour
      
      console.warn(
        `[CircuitBreaker] ⚠️ AUTH FAILURE (early warning) for domain ${domain}: ${reason} (${authFailureCount}/${this.defaultConfig.authFailureThreshold})`
      );

      // Also increment general failure count (auth failures count toward general threshold too)
      const failureKey = `circuit_failures:${normalizedDomain}`;
      const generalFailureCount = await redis.incr(failureKey);
      await redis.expire(failureKey, 3600);

      // Check if auth failure threshold reached (lower threshold - early warning)
      if (authFailureCount >= this.defaultConfig.authFailureThreshold) {
        const resetAt = new Date(Date.now() + this.defaultConfig.resetTimeout);
        const circuitData = {
          reason: `Authentication failures detected: ${reason}. Circuit opened after ${authFailureCount} EAUTH failures (early warning - account lock may be imminent).`,
          openedAt: new Date().toISOString(),
          resetAt: resetAt.toISOString(),
          failureCount: authFailureCount,
          authFailureCount,
          triggeredBy: 'auth_failure',
        };

        await redis.set(circuitKey, JSON.stringify(circuitData));
        await redis.expire(circuitKey, Math.ceil(this.defaultConfig.resetTimeout / 1000));

        console.error(
          `[CircuitBreaker] ⚠️ CIRCUIT OPENED (EARLY WARNING) for domain ${domain} after ${authFailureCount} EAUTH failures. ` +
          `This may prevent account lock. Sending paused until ${resetAt.toISOString()}. Reason: ${reason}`
        );
        return; // Circuit opened, don't check general threshold
      }

      // Check general failure threshold (auth failures also count)
      if (generalFailureCount >= this.defaultConfig.failureThreshold) {
        const resetAt = new Date(Date.now() + this.defaultConfig.resetTimeout);
        const circuitData = {
          reason: `Multiple failures detected: ${reason}. Circuit opened after ${generalFailureCount} failures (including ${authFailureCount} auth failures).`,
          openedAt: new Date().toISOString(),
          resetAt: resetAt.toISOString(),
          failureCount: generalFailureCount,
          authFailureCount,
          triggeredBy: 'general_failure',
        };

        await redis.set(circuitKey, JSON.stringify(circuitData));
        await redis.expire(circuitKey, Math.ceil(this.defaultConfig.resetTimeout / 1000));

        console.error(
          `[CircuitBreaker] ⚠️ CIRCUIT OPENED for domain ${domain} after ${generalFailureCount} failures. ` +
          `Sending paused until ${resetAt.toISOString()}. Reason: ${reason}`
        );
      }
    } catch (error: any) {
      // Don't throw - circuit breaker failures shouldn't block error recording
      console.error(`[CircuitBreaker] Error recording auth failure for domain ${domain}:`, error?.message || error);
    }
  }

  /**
   * Record a critical failure (account locked, domain exceeded, etc.)
   * Opens circuit if threshold is reached
   * @param domain The sending domain
   * @param reason Reason for the failure
   */
  async recordCriticalFailure(domain: string, reason: string): Promise<void> {
    try {
      const normalizedDomain = domain.trim().toLowerCase();
      const redis = getRedisClient();
      const failureKey = `circuit_failures:${normalizedDomain}`;
      const circuitKey = `circuit_breaker:${normalizedDomain}`;
      
      // CRITICAL: "Domain exceeded failures" and "Account locked" errors should trigger IMMEDIATELY (threshold = 1)
      // These errors mean the mail server has already detected critical issues
      const isDomainExceededError = reason.toLowerCase().includes('domain has exceeded') ||
                                    reason.toLowerCase().includes('max defers') ||
                                    reason.toLowerCase().includes('max failures') ||
                                    reason.toLowerCase().includes('message discarded');
      
      const isAccountLockedError = reason.toLowerCase().includes('account has been locked') ||
                                   reason.toLowerCase().includes('account locked') ||
                                   reason.toLowerCase().includes('account is locked');
      
      // Use lower threshold (1) for critical errors that are already warnings
      // Domain exceeded = mail server already detected too many failures
      // Account locked = account is already locked, no point continuing
      const threshold = (isDomainExceededError || isAccountLockedError) ? 1 : this.defaultConfig.failureThreshold;
      
      // Increment failure count
      const failureCount = await redis.incr(failureKey);
      await redis.expire(failureKey, 3600); // Expire after 1 hour
      
      console.warn(
        `[CircuitBreaker] Critical failure recorded for domain ${domain}: ${reason} (${failureCount}/${threshold})`
      );

      // If threshold reached, open circuit IMMEDIATELY
      if (failureCount >= threshold) {
        const resetAt = new Date(Date.now() + this.defaultConfig.resetTimeout);
        const circuitData = {
          reason: `Account/domain issue detected: ${reason}. Circuit opened after ${failureCount} consecutive failures.`,
          openedAt: new Date().toISOString(),
          resetAt: resetAt.toISOString(),
          failureCount,
          triggeredBy: 'critical_failure',
        };

        await redis.set(circuitKey, JSON.stringify(circuitData));
        await redis.expire(circuitKey, Math.ceil(this.defaultConfig.resetTimeout / 1000)); // Expire when circuit resets

        console.error(
          `[CircuitBreaker] ⚠️ CIRCUIT OPENED for domain ${domain} after ${failureCount} failures. ` +
          `Sending paused until ${resetAt.toISOString()}. Reason: ${reason}`
        );
      }
    } catch (error: any) {
      // Don't throw - circuit breaker failures shouldn't block error recording
      console.error(`[CircuitBreaker] Error recording failure for domain ${domain}:`, error?.message || error);
    }
  }

  /**
   * Record a successful send (gradually reduces failure counts instead of immediate reset)
   * This prevents the counter from being reset if there are intermittent failures
   * @param domain The sending domain
   */
  async recordSuccess(domain: string): Promise<void> {
    try {
      const normalizedDomain = domain.trim().toLowerCase();
      const redis = getRedisClient();
      const failureKey = `circuit_failures:${normalizedDomain}`;
      const authFailureKey = `circuit_auth_failures:${normalizedDomain}`;
      
      // Instead of immediately deleting, reduce the count gradually
      // This prevents reset if there are intermittent failures mixed with successes
      const currentFailures = parseInt(await redis.get(failureKey) || '0', 10);
      const currentAuthFailures = parseInt(await redis.get(authFailureKey) || '0', 10);
      
      if (currentFailures > 0) {
        // Reduce by 1 for each success, but don't go below 0
        const newCount = Math.max(0, currentFailures - 1);
        if (newCount === 0) {
          await redis.del(failureKey);
        } else {
          await redis.set(failureKey, newCount.toString());
          await redis.expire(failureKey, 3600);
        }
      }
      
      if (currentAuthFailures > 0) {
        // Reduce by 1 for each success
        const newCount = Math.max(0, currentAuthFailures - 1);
        if (newCount === 0) {
          await redis.del(authFailureKey);
        } else {
          await redis.set(authFailureKey, newCount.toString());
          await redis.expire(authFailureKey, 3600);
        }
      }
    } catch (error: any) {
      // Don't throw - circuit breaker failures shouldn't block success recording
      console.warn(`[CircuitBreaker] Error recording success for domain ${domain}:`, error?.message || error);
    }
  }

  /**
   * Manually reset circuit breaker for a domain (for admin use)
   * @param domain The sending domain
   */
  async resetCircuit(domain: string): Promise<void> {
    try {
      const normalizedDomain = domain.trim().toLowerCase();
      const redis = getRedisClient();
      const circuitKey = `circuit_breaker:${normalizedDomain}`;
      const failureKey = `circuit_failures:${normalizedDomain}`;
      const authFailureKey = `circuit_auth_failures:${normalizedDomain}`;
      
      await redis.del(circuitKey);
      await redis.del(failureKey);
      await redis.del(authFailureKey);
      
      console.log(`[CircuitBreaker] Circuit breaker manually reset for domain ${domain}`);
    } catch (error: any) {
      console.error(`[CircuitBreaker] Error resetting circuit for domain ${domain}:`, error?.message || error);
      throw error;
    }
  }

  /**
   * Get circuit breaker status for a domain
   * @param domain The sending domain
   */
  async getStatus(domain: string): Promise<{
    isOpen: boolean;
    failureCount: number;
    authFailureCount: number;
    reason?: string;
    openedAt?: Date;
    resetAt?: Date;
    triggeredBy?: string;
  }> {
    try {
      const normalizedDomain = domain.trim().toLowerCase();
      const redis = getRedisClient();
      const circuitKey = `circuit_breaker:${normalizedDomain}`;
      const failureKey = `circuit_failures:${normalizedDomain}`;
      const authFailureKey = `circuit_auth_failures:${normalizedDomain}`;
      
      const circuitData = await redis.get(circuitKey);
      const failureCount = parseInt(await redis.get(failureKey) || '0', 10);
      const authFailureCount = parseInt(await redis.get(authFailureKey) || '0', 10);
      
      if (!circuitData) {
        return {
          isOpen: false,
          failureCount,
          authFailureCount,
        };
      }

      const data = JSON.parse(circuitData);
      return {
        isOpen: true,
        failureCount,
        authFailureCount: data.authFailureCount || authFailureCount,
        reason: data.reason,
        openedAt: new Date(data.openedAt),
        resetAt: new Date(data.resetAt),
        triggeredBy: data.triggeredBy,
      };
    } catch (error: any) {
      console.error(`[CircuitBreaker] Error getting status for domain ${domain}:`, error?.message || error);
      return {
        isOpen: false,
        failureCount: 0,
        authFailureCount: 0,
      };
    }
  }
}

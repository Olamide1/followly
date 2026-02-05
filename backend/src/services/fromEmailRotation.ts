import { getRedisClient } from './redis';

/**
 * Service to automatically rotate "from" email addresses for better deliverability
 * Takes a single user-configured "from" email and automatically rotates between 15 variants
 * This distributes load across multiple addresses, preventing any single address from hitting limits
 * 
 * Example:
 * - User configures: noreply@support.yourdomain.com
 * - System automatically rotates between 15 variants: noreply, hello, info, notifications, updates, team, etc.
 * - Load balancing ensures even distribution and optimal deliverability
 * - Rotation is transparent to the user
 */
export class FromEmailRotationService {
  private redis: ReturnType<typeof getRedisClient> | null = null;

  private getRedis() {
    if (!this.redis) {
      this.redis = getRedisClient();
    }
    return this.redis;
  }

  /**
   * Generate multiple "from" email variants from a base email
   * CRITICAL: All variants use the SAME domain to ensure warmup, rate limits, and circuit breakers
   * apply correctly (all protections are domain-based, not "from" email-based)
   * @param baseFromEmail The user-configured "from" email (e.g., noreply@support.yourdomain.com)
   * @returns Array of email variants to rotate between (all same domain)
   */
  private generateEmailVariants(baseFromEmail: string): string[] {
    if (!baseFromEmail || !baseFromEmail.includes('@')) {
      return [baseFromEmail]; // Return as-is if invalid
    }

    const [localPart, domain] = baseFromEmail.split('@');
    
    // Validate domain exists
    if (!domain || domain.trim() === '') {
      console.warn(`[FromEmailRotation] Invalid domain in ${baseFromEmail}, returning original`);
      return [baseFromEmail];
    }
    
    // Common prefixes for email rotation (same domain, different local parts)
    // IMPORTANT: All variants MUST use the same domain to maintain protection consistency
    // 15 variants for optimal load distribution and deliverability resilience
    const prefixes = [
      localPart,       // Original (e.g., noreply)
      'hello',         // hello@support.yourdomain.com
      'info',          // info@support.yourdomain.com
      'notifications', // notifications@support.yourdomain.com
      'mail',          // mail@support.yourdomain.com
      'updates',       // updates@support.yourdomain.com - for newsletters/updates
      'team',          // team@support.yourdomain.com - personal touch
      'news',          // news@support.yourdomain.com - announcements
      'contact',       // contact@support.yourdomain.com - general inquiries
      'support',       // support@support.yourdomain.com - service-related
      'service',       // service@support.yourdomain.com - alternative to support
      'alerts',        // alerts@support.yourdomain.com - time-sensitive messages
      'no-reply',      // no-reply@support.yourdomain.com - variant with hyphen
      'notify',        // notify@support.yourdomain.com - shorter alternative
      'mailer',        // mailer@support.yourdomain.com - classic sending address
    ];

    // Generate variants, removing duplicates
    // All variants use the SAME domain - this ensures:
    // - Warmup schedules apply (domain-based)
    // - Rate limits apply (domain-based)
    // - Circuit breakers apply (domain-based)
    // - Domain reputation applies (domain-based)
    const variants = [...new Set(prefixes.map(prefix => `${prefix}@${domain}`))];
    
    // Safety check: ensure all variants use the same domain
    const allSameDomain = variants.every(v => v.split('@')[1] === domain);
    if (!allSameDomain) {
      console.error(`[FromEmailRotation] CRITICAL: Domain mismatch detected! All variants must use domain ${domain}`);
      return [baseFromEmail]; // Return original if domain mismatch
    }
    
    return variants;
  }

  /**
   * Get the next "from" email to use for rotation
   * Uses round-robin with Redis to track rotation state
   * @param baseFromEmail The user-configured "from" email
   * @param domain The sending domain (for tracking)
   * @returns The rotated "from" email address to use
   */
  async getRotatedFromEmail(baseFromEmail: string, domain: string): Promise<string> {
    try {
      // Generate variants
      const variants = this.generateEmailVariants(baseFromEmail);
      
      // If only one variant, return it (no rotation needed)
      if (variants.length === 1) {
        return variants[0];
      }

      const redis = this.getRedis();
      const rotationKey = `from_email_rotation:${domain}`;
      
      // Get current rotation index (defaults to 0)
      const currentIndex = parseInt(await redis.get(rotationKey) || '0', 10);
      
      // Select next variant (round-robin)
      const selectedVariant = variants[currentIndex % variants.length];
      
      // Increment rotation index for next time
      const nextIndex = (currentIndex + 1) % variants.length;
      await redis.set(rotationKey, nextIndex.toString());
      await redis.expire(rotationKey, 86400); // Expire after 24 hours
      
      // Log rotation for debugging (only if different from base)
      if (selectedVariant !== baseFromEmail) {
        console.log(
          `[FromEmailRotation] Rotated from "${baseFromEmail}" to "${selectedVariant}" ` +
          `for domain ${domain} (variant ${currentIndex + 1}/${variants.length})`
        );
      }
      
      return selectedVariant;
    } catch (error: any) {
      // If Redis fails or rotation fails, fall back to base email
      console.warn(
        `[FromEmailRotation] Failed to rotate from email for ${baseFromEmail}, using base email:`,
        error?.message || error
      );
      return baseFromEmail;
    }
  }

  /**
   * Get rotated "from" email based on volume/load balancing
   * Distributes emails across variants based on current usage
   * @param baseFromEmail The user-configured "from" email
   * @param domain The sending domain
   * @returns The rotated "from" email address to use
   */
  async getLoadBalancedFromEmail(baseFromEmail: string, domain: string): Promise<string> {
    try {
      const variants = this.generateEmailVariants(baseFromEmail);
      
      if (variants.length === 1) {
        return variants[0];
      }

      const redis = this.getRedis();
      const now = Date.now();
      const hour = Math.floor(now / (1000 * 60 * 60)); // Current hour timestamp
      
      // Get usage counts for each variant in current hour
      const usagePromises = variants.map(async (variant) => {
        const usageKey = `from_email_usage:${domain}:${variant}:${hour}`;
        const count = parseInt(await redis.get(usageKey) || '0', 10);
        return { variant, count };
      });
      
      const usage = await Promise.all(usagePromises);
      
      // Select variant with lowest usage (load balancing)
      const selected = usage.reduce((min, current) => 
        current.count < min.count ? current : min
      );
      
      // Increment usage counter for selected variant
      const usageKey = `from_email_usage:${domain}:${selected.variant}:${hour}`;
      await redis.incr(usageKey);
      await redis.expire(usageKey, 3600); // Expire after 1 hour
      
      // Log if rotated
      if (selected.variant !== baseFromEmail) {
        console.log(
          `[FromEmailRotation] Load-balanced from "${baseFromEmail}" to "${selected.variant}" ` +
          `for domain ${domain} (usage: ${selected.count + 1} emails this hour)`
        );
      }
      
      return selected.variant;
    } catch (error: any) {
      // Fall back to base email on error
      console.warn(
        `[FromEmailRotation] Failed to load-balance from email for ${baseFromEmail}, using base email:`,
        error?.message || error
      );
      return baseFromEmail;
    }
  }

  /**
   * Get rotated "from" email (uses load balancing by default, falls back to round-robin)
   * CRITICAL: This function ensures the rotated email uses the SAME domain as the base email
   * All protections (warmup, rate limits, circuit breakers) are domain-based, so rotating
   * "from" emails within the same domain maintains protection consistency
   * 
   * @param baseFromEmail The user-configured "from" email
   * @param domain The sending domain (extracted from baseFromEmail before rotation)
   * @returns The rotated "from" email address to use (same domain as base)
   */
  async getFromEmail(baseFromEmail: string, domain: string): Promise<string> {
    // Validate that baseFromEmail domain matches provided domain
    const baseDomain = baseFromEmail.split('@')[1];
    if (baseDomain && baseDomain.toLowerCase() !== domain.toLowerCase()) {
      console.warn(
        `[FromEmailRotation] Domain mismatch: baseFromEmail domain (${baseDomain}) != provided domain (${domain}). ` +
        `Using baseFromEmail as-is to maintain protection consistency.`
      );
      return baseFromEmail; // Return original if domain mismatch
    }
    
    // Use load balancing for better distribution
    const rotated = await this.getLoadBalancedFromEmail(baseFromEmail, domain);
    
    // Final safety check: ensure rotated email uses same domain
    const rotatedDomain = rotated.split('@')[1];
    if (rotatedDomain && rotatedDomain.toLowerCase() !== domain.toLowerCase()) {
      console.error(
        `[FromEmailRotation] CRITICAL: Rotated email domain (${rotatedDomain}) != expected domain (${domain}). ` +
        `Returning baseFromEmail to prevent protection bypass.`
      );
      return baseFromEmail; // Return original if domain mismatch
    }
    
    return rotated;
  }

  /**
   * Reset rotation state for a domain (useful for testing or manual reset)
   * @param domain The domain to reset rotation for
   */
  async resetRotation(domain: string): Promise<void> {
    try {
      const redis = this.getRedis();
      const rotationKey = `from_email_rotation:${domain}`;
      await redis.del(rotationKey);
      
      // Also clear usage counters (optional - they expire anyway)
      // This would require pattern matching which Redis doesn't support directly
      // So we'll just let them expire naturally
    } catch (error: any) {
      console.warn(`[FromEmailRotation] Failed to reset rotation for ${domain}:`, error?.message || error);
    }
  }
}

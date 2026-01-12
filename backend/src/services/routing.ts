import { pool } from '../database/connection';
import { EmailProviderService, ProviderType } from './providers';
import { getRedisClient } from './redis';

export interface RoutingDecision {
  provider: ProviderType;
  reason: string;
}

export class RoutingService {
  private providerService: EmailProviderService;
  private redis: ReturnType<typeof getRedisClient> | null = null;

  constructor(providerService: EmailProviderService) {
    this.providerService = providerService;
  }

  // Cache Redis client for the instance lifetime
  private getRedis() {
    if (!this.redis) {
      this.redis = getRedisClient();
    }
    return this.redis;
  }

  async selectProvider(
    userId: number,
    _campaignType: 'broadcast' | 'lifecycle' = 'lifecycle'
  ): Promise<RoutingDecision> {
    // Priority order:
    // 1. User's own provider (if configured and available)
    // 2. Any provider that's loaded in providerService
    // 3. Fallback to default providers

    // First, check what providers are actually loaded in the providerService
    const availableProviders: ProviderType[] = (['brevo', 'mailjet', 'resend'] as ProviderType[]).filter(p => this.providerService.hasProvider(p));
    
    if (availableProviders.length === 0) {
      throw new Error('No available email providers');
    }

    // Check user's provider configs from database
    const userProviders = await this.getUserProviders(userId);
    
    // Try user's default provider first (if it's loaded)
    const userDefault = userProviders.find((p: any) => p.is_default && p.is_active);
    if (userDefault && availableProviders.includes(userDefault.provider as ProviderType)) {
      const available = await this.checkProviderAvailability(userId, userDefault.provider);
      if (available) {
        return {
          provider: userDefault.provider as ProviderType,
          reason: 'User default provider',
        };
      }
    }

    // Try any active user provider (if it's loaded)
    const activeProviders = userProviders.filter((p: any) => p.is_active);
    for (const provider of activeProviders) {
      if (availableProviders.includes(provider.provider as ProviderType)) {
        const available = await this.checkProviderAvailability(userId, provider.provider as ProviderType);
        if (available) {
          return {
            provider: provider.provider as ProviderType,
            reason: 'User configured provider',
          };
        }
      }
    }

    // Use first available provider (prioritize resend, then mailjet, then brevo)
    const priorityOrder: ProviderType[] = ['resend', 'mailjet', 'brevo'];
    for (const provider of priorityOrder) {
      if (availableProviders.includes(provider)) {
        const available = await this.checkProviderAvailability(userId, provider);
        if (available) {
          return {
            provider,
            reason: 'Available provider',
          };
        }
      }
    }

    // Final fallback - use first available provider
    const firstAvailable = availableProviders[0];
    const available = await this.checkProviderAvailability(userId, firstAvailable);
    if (available) {
      return {
        provider: firstAvailable,
        reason: 'Fallback provider',
      };
    }

    throw new Error('No available email providers');
  }

  private async getUserProviders(userId: number) {
    const result = await pool.query(
      'SELECT * FROM provider_configs WHERE user_id = $1 ORDER BY is_default DESC, created_at ASC',
      [userId]
    );
    console.log(`Database providers for user ${userId}:`, result.rows.map((r: any) => ({ provider: r.provider, is_active: r.is_active, is_default: r.is_default })));
    return result.rows;
  }

  private async checkProviderAvailability(
    userId: number,
    provider: ProviderType
  ): Promise<boolean> {
    // Check if provider is configured first (no Redis call needed)
    if (!this.providerService.hasProvider(provider)) {
      console.log(`Provider ${provider} not found in providerService for user ${userId}`);
      return false;
    }

    try {
      const redis = this.getRedis();
      const today = new Date().toISOString().split('T')[0];
      const countKey = `provider:${userId}:${provider}:${today}:count`;

      // Batch Redis calls - if Redis fails, allow the provider (fail open)
      const [count, dailyLimit] = await Promise.all([
        redis.get(countKey).catch(() => null), // If Redis fails, treat as no count
        this.getProviderDailyLimit(userId, provider),
      ]);

      // Check daily limit
      if (count && parseInt(count) >= dailyLimit) {
        return false;
      }

      // Note: Error rate checking is temporarily disabled due to bug in error key logic
      // TODO: Implement proper error rate checking using Redis SCAN or sorted sets

      return true;
    } catch (error) {
      // If Redis or any check fails, allow the provider (fail open)
      // Log the error but don't block email sending
      console.error(`Error checking provider availability for ${provider}:`, error);
      return true;
    }
  }

  private async getProviderDailyLimit(userId: number, provider: ProviderType): Promise<number> {
    const result = await pool.query(
      'SELECT daily_limit FROM provider_configs WHERE user_id = $1 AND provider = $2',
      [userId, provider]
    );
    
    if (result.rows.length > 0 && result.rows[0].daily_limit > 0) {
      return result.rows[0].daily_limit;
    }

    // Default limits
    const defaults: Record<ProviderType, number> = {
      brevo: 10000,
      mailjet: 6000,
      resend: 50000,
    };

    return defaults[provider] || 1000;
  }

  async recordProviderUsage(
    userId: number,
    provider: ProviderType,
    success: boolean
  ): Promise<void> {
    const redis = this.getRedis();
    const today = new Date().toISOString().split('T')[0];
    
    if (success) {
      const key = `provider:${userId}:${provider}:${today}:count`;
      // Use multi to batch commands
      await redis.multi()
        .incr(key)
        .expire(key, 86400)
        .exec();
    } else {
      const errorKey = `provider:${userId}:${provider}:errors:${Date.now()}`;
      await redis.multi()
        .incr(errorKey)
        .expire(errorKey, 3600)
        .exec();
    }
  }
}


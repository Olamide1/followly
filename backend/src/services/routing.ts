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
    
    // Try user's default provider first (if it's loaded) - use it directly, no need to check availability
    const userDefault = userProviders.find((p: any) => p.is_default && p.is_active);
    if (userDefault && availableProviders.includes(userDefault.provider as ProviderType)) {
      return {
        provider: userDefault.provider as ProviderType,
        reason: 'User default provider',
      };
    }

    // Try any active user provider (if it's loaded) - use it directly
    const activeProviders = userProviders.filter((p: any) => p.is_active);
    for (const provider of activeProviders) {
      if (availableProviders.includes(provider.provider as ProviderType)) {
        return {
          provider: provider.provider as ProviderType,
          reason: 'User configured provider',
        };
      }
    }

    // Use first available provider - if we got here, use any loaded provider directly
    const firstAvailable = availableProviders[0];
    console.log(`Using first available provider: ${firstAvailable}`);
    return {
      provider: firstAvailable,
      reason: 'Available provider',
    };
  }

  private async getUserProviders(userId: number) {
    const result = await pool.query(
      'SELECT * FROM provider_configs WHERE user_id = $1 ORDER BY is_default DESC, created_at ASC',
      [userId]
    );
    console.log(`Database providers for user ${userId}:`, result.rows.map((r: any) => ({ provider: r.provider, is_active: r.is_active, is_default: r.is_default })));
    return result.rows;
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


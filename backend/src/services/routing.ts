import { pool } from '../database/connection';
import { EmailProviderService, ProviderType } from './providers';
import { getRedisClient } from './redis';

export interface RoutingDecision {
  provider: ProviderType;
  reason: string;
}

export class RoutingService {
  private providerService: EmailProviderService;

  constructor(providerService: EmailProviderService) {
    this.providerService = providerService;
  }

  async selectProvider(
    userId: number,
    campaignType: 'broadcast' | 'lifecycle' = 'lifecycle'
  ): Promise<RoutingDecision> {
    // Priority order:
    // 1. User's own provider (if configured and available)
    // 2. Default provider based on campaign type
    // 3. Fallback to available provider

    // Check user's provider configs
    const userProviders = await this.getUserProviders(userId);
    
    // Try user's default provider first
    const userDefault = userProviders.find((p: any) => p.is_default && p.is_active);
    if (userDefault) {
      const available = await this.checkProviderAvailability(userId, userDefault.provider);
      if (available) {
        return {
          provider: userDefault.provider as ProviderType,
          reason: 'User default provider',
        };
      }
    }

    // Try any active user provider
    for (const provider of userProviders.filter((p: any) => p.is_active)) {
      const available = await this.checkProviderAvailability(userId, provider.provider as ProviderType);
      if (available) {
        return {
          provider: provider.provider as ProviderType,
          reason: 'User configured provider',
        };
      }
    }

    // Default routing based on campaign type
    if (campaignType === 'lifecycle') {
      // Brevo for bulk lifecycle
      if (await this.checkProviderAvailability(userId, 'brevo')) {
        return {
          provider: 'brevo',
          reason: 'Default lifecycle provider',
        };
      }
    }

    // Mailjet for overflow
    if (await this.checkProviderAvailability(userId, 'mailjet')) {
      return {
        provider: 'mailjet',
        reason: 'Overflow provider',
      };
    }

    // Resend for reliability
    if (await this.checkProviderAvailability(userId, 'resend')) {
      return {
        provider: 'resend',
        reason: 'Reliability provider',
      };
    }

    // Fallback to any available
    const availableProviders: ProviderType[] = ['brevo', 'mailjet', 'resend'];
    for (const provider of availableProviders) {
      if (await this.checkProviderAvailability(userId, provider)) {
        return {
          provider,
          reason: 'Fallback provider',
        };
      }
    }

    throw new Error('No available email providers');
  }

  private async getUserProviders(userId: number) {
    const result = await pool.query(
      'SELECT * FROM provider_configs WHERE user_id = $1 ORDER BY is_default DESC, created_at ASC',
      [userId]
    );
    return result.rows;
  }

  private async checkProviderAvailability(
    userId: number,
    provider: ProviderType
  ): Promise<boolean> {
    const redis = getRedisClient();
    
    // Check daily limit
    const today = new Date().toISOString().split('T')[0];
    const key = `provider:${userId}:${provider}:${today}:count`;
    const count = await redis.get(key);
    const dailyLimit = await this.getProviderDailyLimit(userId, provider);
    
    if (count && parseInt(count) >= dailyLimit) {
      return false;
    }

    // Check error rate (last hour)
    const errorKey = `provider:${userId}:${provider}:errors:${Date.now() - 3600000}`;
    const errorCount = await redis.get(errorKey);
    if (errorCount && parseInt(errorCount) > 10) {
      return false; // Too many errors recently
    }

    // Check if provider is configured
    if (!this.providerService.hasProvider(provider)) {
      return false;
    }

    return true;
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
    const redis = getRedisClient();
    const today = new Date().toISOString().split('T')[0];
    
    if (success) {
      const key = `provider:${userId}:${provider}:${today}:count`;
      await redis.incr(key);
      await redis.expire(key, 86400); // 24 hours
    } else {
      const errorKey = `provider:${userId}:${provider}:errors:${Date.now()}`;
      await redis.incr(errorKey);
      await redis.expire(errorKey, 3600); // 1 hour
    }
  }
}


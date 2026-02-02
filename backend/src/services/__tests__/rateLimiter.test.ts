import { RateLimiterService } from '../rateLimiter';
import { getRedisClient } from '../redis';
import { DomainReputationService } from '../domainReputation';
import { WarmupService } from '../warmup';

jest.mock('../redis');
jest.mock('../domainReputation');
jest.mock('../warmup');

describe('RateLimiterService', () => {
  let service: RateLimiterService;
  const mockRedis = {
    get: jest.fn(),
    multi: jest.fn().mockReturnThis(),
    incr: jest.fn().mockReturnThis(),
    expire: jest.fn().mockReturnThis(),
    exec: jest.fn(),
  };

  beforeEach(() => {
    service = new RateLimiterService();
    (getRedisClient as jest.Mock).mockReturnValue(mockRedis);
    jest.clearAllMocks();
  });

  describe('Input Validation', () => {
    it('should fail open for invalid domain (safety)', async () => {
      // Rate limiter fails open for safety - invalid input doesn't block emails
      const result1 = await service.canSend('');
      expect(result1.canSend).toBe(true); // Fail open
      
      const result2 = await service.canSend('   ');
      expect(result2.canSend).toBe(true); // Fail open
    });

    it('should fail open for invalid userId (safety)', async () => {
      // Rate limiter fails open for safety
      const result1 = await service.canSend('example.com', { userId: 0 });
      expect(result1.canSend).toBe(true); // Fail open
      
      const result2 = await service.canSend('example.com', { userId: -1 });
      expect(result2.canSend).toBe(true); // Fail open
    });
  });

  describe('canSend', () => {
    it('should return true if under limit', async () => {
      mockRedis.get.mockResolvedValueOnce('10');

      const result = await service.canSend('example.com');

      expect(result.canSend).toBe(true);
      expect(result.currentCount).toBe(10);
      expect(result.limit).toBe(60);
    });

    it('should return false if at limit', async () => {
      mockRedis.get.mockResolvedValueOnce('60');

      const result = await service.canSend('example.com');

      expect(result.canSend).toBe(false);
      expect(result.currentCount).toBe(60);
    });

    it('should calculate dynamic limit based on reputation', async () => {
      (DomainReputationService as any).mockImplementation(() => ({
        getReputation: jest.fn().mockResolvedValue({
          reputationScore: 95,
          status: 'active',
        }),
      }));
      
      (WarmupService as any).mockImplementation(() => ({
        getWarmupSchedule: jest.fn().mockResolvedValue(null),
      }));

      mockRedis.get.mockResolvedValueOnce('50');

      const result = await service.canSend('example.com', {
        userId: 1,
        provider: 'resend',
      });

      // Should use base limit (100) * 1.2 for excellent reputation = 120
      expect(result.limit).toBeGreaterThan(100);
    });

    it('should reduce limit for poor reputation', async () => {
      (DomainReputationService as any).mockImplementation(() => ({
        getReputation: jest.fn().mockResolvedValue({
          reputationScore: 60,
          status: 'active',
        }),
      }));
      
      (WarmupService as any).mockImplementation(() => ({
        getWarmupSchedule: jest.fn().mockResolvedValue(null),
      }));

      mockRedis.get.mockResolvedValueOnce('40');

      const result = await service.canSend('example.com', {
        userId: 1,
        provider: 'resend',
      });

      // Should use base limit (100) * 0.8 for low reputation = 80
      expect(result.limit).toBeLessThan(100);
    });

    it('should return zero limit if domain is paused', async () => {
      // Create a mock that returns paused status
      const mockGetReputation = jest.fn().mockResolvedValue({
        reputationScore: 50,
        status: 'paused',
      });
      
      (DomainReputationService as any).mockImplementation(() => ({
        getReputation: mockGetReputation,
      }));
      
      // Mock warmup to return null (not in warmup) so it doesn't override
      (WarmupService as any).mockImplementation(() => ({
        getWarmupSchedule: jest.fn().mockResolvedValue(null),
      }));

      const result = await service.canSend('example.com', {
        userId: 1,
        provider: 'resend',
      });

      // Verify the mock was called
      expect(mockGetReputation).toHaveBeenCalledWith(1, 'example.com');
      expect(result.canSend).toBe(false);
      expect(result.limit).toBe(0);
    });

    it('should consider warmup limits', async () => {
      (DomainReputationService as any).mockImplementation(() => ({
        getReputation: jest.fn().mockResolvedValue({
          reputationScore: 100,
          status: 'active',
        }),
      }));
      
      (WarmupService as any).mockImplementation(() => ({
        getWarmupSchedule: jest.fn().mockResolvedValue({
          id: 1,
          phase: 1,
          daily_limit: 100,
        }),
        getDailyLimit: jest.fn().mockResolvedValue(100),
      }));

      mockRedis.get.mockResolvedValueOnce('3');

      const result = await service.canSend('example.com', {
        userId: 1,
        provider: 'resend',
      });

      // Warmup limit: 100/day = ~4/hour, should use the more restrictive limit
      expect(result.limit).toBeLessThanOrEqual(4);
    });

    it('should fail open on Redis error', async () => {
      mockRedis.get.mockRejectedValueOnce(new Error('Redis connection failed'));

      const result = await service.canSend('example.com');

      expect(result.canSend).toBe(true); // Fail open
    });
  });

  describe('recordSend', () => {
    it('should increment count in Redis', async () => {
      mockRedis.exec.mockResolvedValueOnce([null, [null, '11']]);
      mockRedis.get.mockResolvedValueOnce('11');

      await service.recordSend('example.com');

      expect(mockRedis.incr).toHaveBeenCalled();
      expect(mockRedis.expire).toHaveBeenCalledWith(expect.any(String), 7200);
    });

    it('should log warning at 80% and 95%', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
      const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

      mockRedis.exec.mockResolvedValueOnce([null, [null, '48']]);
      mockRedis.get.mockResolvedValueOnce('48'); // 80% of 60

      await service.recordSend('example.com', { maxEmailsPerHour: 60 });

      expect(consoleSpy).toHaveBeenCalled();

      mockRedis.exec.mockResolvedValueOnce([null, [null, '57']]);
      mockRedis.get.mockResolvedValueOnce('57'); // 95% of 60

      await service.recordSend('example.com', { maxEmailsPerHour: 60 });

      expect(consoleWarnSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
      consoleWarnSpy.mockRestore();
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.exec.mockRejectedValueOnce(new Error('Redis error'));

      await expect(service.recordSend('example.com')).resolves.not.toThrow();
    });
  });

  describe('getStatus', () => {
    it('should return current status', async () => {
      mockRedis.get.mockResolvedValueOnce('30');

      const result = await service.getStatus('example.com');

      expect(result.currentCount).toBe(30);
      expect(result.limit).toBe(60);
      expect(result.percentageUsed).toBe(50);
      expect(result.timeUntilReset).toBeGreaterThan(0);
    });

    it('should calculate dynamic limit if userId and provider provided', async () => {
      (DomainReputationService as any).mockImplementation(() => ({
        getReputation: jest.fn().mockResolvedValue({
          reputationScore: 90,
          status: 'active',
        }),
      }));
      
      // Mock warmup to return null (not in warmup) so reputation limit is used
      (WarmupService as any).mockImplementation(() => ({
        getWarmupSchedule: jest.fn().mockResolvedValue(null),
      }));

      mockRedis.get.mockResolvedValueOnce('20');

      const result = await service.getStatus('example.com', 1, 'resend');

      // Base limit for resend is 100, with 90 reputation score it should be 100 * 1.2 = 120
      expect(result.limit).toBeGreaterThan(60); // Should use dynamic limit
    });
  });
});

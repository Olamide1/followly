import { WarmupService } from '../warmup';
import { pool } from '../../database/connection';

jest.mock('../../database/connection', () => ({
  pool: {
    query: jest.fn(),
  },
}));

describe('WarmupService', () => {
  let service: WarmupService;
  const mockPool = pool as any;

  beforeEach(() => {
    service = new WarmupService();
    jest.clearAllMocks();
  });

  describe('Input Validation', () => {
    it('should throw error for invalid userId', async () => {
      await expect(service.getWarmupSchedule(0, 'example.com', 'resend')).rejects.toThrow('Invalid userId');
      await expect(service.getWarmupSchedule(-1, 'example.com', 'resend')).rejects.toThrow('Invalid userId');
    });

    it('should throw error for invalid domain', async () => {
      await expect(service.getWarmupSchedule(1, '', 'resend')).rejects.toThrow('Invalid domain');
    });

    it('should throw error for invalid provider', async () => {
      await expect(service.getWarmupSchedule(1, 'example.com', 'invalid')).rejects.toThrow('Invalid provider');
    });

    it('should normalize domain and provider to lowercase', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.getWarmupSchedule(1, 'EXAMPLE.COM', 'RESEND');
      
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('warmup_schedules'),
        expect.arrayContaining([1, 'example.com', 'resend'])
      );
    });
  });

  describe('createWarmupSchedule', () => {
    it('should create schedule with correct limits for ESP providers', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // getWarmupSchedule
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          user_id: 1,
          domain: 'example.com',
          provider: 'resend',
          phase: 1,
          daily_limit: 100,
        }],
      });

      const result = await service.createWarmupSchedule(1, 'example.com', 'resend');

      expect(result.daily_limit).toBe(100);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO warmup_schedules'),
        expect.arrayContaining([1, 'example.com', 'resend', 1, 100])
      );
    });

    it('should create schedule with correct limits for SMTP providers', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          user_id: 1,
          domain: 'example.com',
          provider: 'nodemailer',
          phase: 1,
          daily_limit: 20,
        }],
      });

      const result = await service.createWarmupSchedule(1, 'example.com', 'nodemailer');

      expect(result.daily_limit).toBe(20);
    });

    it('should return existing schedule if already exists', async () => {
      const existingSchedule = {
        id: 1,
        user_id: 1,
        domain: 'example.com',
        provider: 'resend',
        phase: 2,
        daily_limit: 200,
      };

      mockPool.query.mockResolvedValueOnce({ rows: [existingSchedule] });

      const result = await service.createWarmupSchedule(1, 'example.com', 'resend');

      expect(result).toEqual(existingSchedule);
      expect(mockPool.query).toHaveBeenCalledTimes(1); // Only getWarmupSchedule, no INSERT
    });
  });

  describe('getDailyLimit', () => {
    it('should return high limit if not in warmup', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const limit = await service.getDailyLimit(1, 'example.com', 'resend');

      expect(limit).toBe(10000);
    });

    it('should return schedule limit if in warmup', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          daily_limit: 100,
          last_reset_date: new Date(),
          current_count: 50,
        }],
      });

      const limit = await service.getDailyLimit(1, 'example.com', 'resend');

      expect(limit).toBe(100);
    });

    it('should reset count if last reset was yesterday', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          daily_limit: 100,
          last_reset_date: yesterday,
          current_count: 50,
        }],
      });
      mockPool.query.mockResolvedValueOnce({ rows: [] }); // UPDATE query

      await service.getDailyLimit(1, 'example.com', 'resend');

      expect(mockPool.query).toHaveBeenCalledTimes(2);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE warmup_schedules'),
        expect.arrayContaining([1])
      );
    });
  });

  describe('canSend', () => {
    it('should return true if not in warmup', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      const result = await service.canSend(1, 'example.com', 'resend');

      expect(result).toBe(true);
    });

    it('should return true if under daily limit', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          daily_limit: 100,
          current_count: 50,
          last_reset_date: new Date(),
        }],
      });
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          daily_limit: 100,
          last_reset_date: new Date(),
        }],
      });

      const result = await service.canSend(1, 'example.com', 'resend');

      expect(result).toBe(true);
    });

    it('should return false if at daily limit', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          daily_limit: 100,
          current_count: 100,
          last_reset_date: new Date(),
        }],
      });
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          daily_limit: 100,
          last_reset_date: new Date(),
        }],
      });

      const result = await service.canSend(1, 'example.com', 'resend');

      expect(result).toBe(false);
    });

    it('should fail open on error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Database error'));

      const result = await service.canSend(1, 'example.com', 'resend');

      expect(result).toBe(true); // Fail open
    });
  });

  describe('updateMetrics', () => {
    it('should slow down if bounce rate is high', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          phase: 1,
          daily_limit: 100,
          metrics: {},
        }],
      });
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.updateMetrics(1, 'example.com', 'resend', {
        bounceRate: 0.06, // Above 5% threshold
        complaintRate: 0.0005,
        deliveredRate: 0.94,
        openRate: 0.20,
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE warmup_schedules'),
        expect.arrayContaining([50]) // Reduced to 50% of original
      );
    });

    it('should progress to next phase if metrics are good', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          phase: 1,
          daily_limit: 100,
          metrics: {},
        }],
      });
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await service.updateMetrics(1, 'example.com', 'resend', {
        bounceRate: 0.005, // Below 1%
        complaintRate: 0.00005, // Below 0.01%
        deliveredRate: 0.995,
        openRate: 0.25,
      });

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE warmup_schedules'),
        expect.arrayContaining([2, 200]) // Phase 2, 200/day
      );
    });

    it('should validate metrics input', async () => {
      await expect(
        service.updateMetrics(1, 'example.com', 'resend', {
          bounceRate: -1, // Invalid
          complaintRate: 0.001,
          deliveredRate: 0.99,
          openRate: 0.20,
        })
      ).rejects.toThrow('Invalid bounceRate');
    });
  });
});

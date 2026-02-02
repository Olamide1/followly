import { DomainReputationService } from '../domainReputation';
import { pool } from '../../database/connection';

// Mock the database connection
jest.mock('../../database/connection', () => ({
  pool: {
    query: jest.fn(),
  },
}));

describe('DomainReputationService', () => {
  let service: DomainReputationService;
  const mockPool = pool as any;

  beforeEach(() => {
    service = new DomainReputationService();
    jest.clearAllMocks();
  });

  describe('Input Validation', () => {
    it('should throw error for invalid userId', async () => {
      await expect(service.getOrCreateReputation(0, 'example.com')).rejects.toThrow('Invalid userId');
      await expect(service.getOrCreateReputation(-1, 'example.com')).rejects.toThrow('Invalid userId');
      await expect(service.getOrCreateReputation(1.5, 'example.com')).rejects.toThrow('Invalid userId');
    });

    it('should throw error for invalid domain', async () => {
      await expect(service.getOrCreateReputation(1, '')).rejects.toThrow('Invalid domain');
      await expect(service.getOrCreateReputation(1, '   ')).rejects.toThrow('Invalid domain');
      await expect(service.getOrCreateReputation(1, 'invalid..domain')).rejects.toThrow('Invalid domain format');
    });

    it('should normalize domain to lowercase', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          user_id: 1,
          domain: 'example.com',
          reputation_score: 100,
          status: 'active',
        }],
      });

      await service.getOrCreateReputation(1, 'EXAMPLE.COM');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('domain_reputation'),
        expect.arrayContaining([1, 'example.com'])
      );
    });
  });

  describe('getOrCreateReputation', () => {
    it('should return existing reputation if found', async () => {
      const mockRow = {
        id: 1,
        user_id: 1,
        domain: 'example.com',
        reputation_score: 85,
        status: 'active',
        bounce_rate: 0.02,
        complaint_rate: 0.001,
        engagement_rate: 0.25,
        total_sent: 1000,
        total_bounced: 20,
        total_complained: 1,
        total_opened: 200,
        total_clicked: 50,
      };

      mockPool.query.mockResolvedValueOnce({ rows: [mockRow] });

      const result = await service.getOrCreateReputation(1, 'example.com');

      expect(result.userId).toBe(1);
      expect(result.domain).toBe('example.com');
      expect(result.reputationScore).toBe(85);
      expect(result.status).toBe('active');
    });

    it('should create new reputation if not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          user_id: 1,
          domain: 'example.com',
          reputation_score: 100,
          status: 'active',
        }],
      });

      const result = await service.getOrCreateReputation(1, 'example.com');

      expect(result.reputationScore).toBe(100);
      expect(result.status).toBe('active');
      expect(mockPool.query).toHaveBeenCalledTimes(2);
    });

    it('should handle database errors', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Database connection failed'));

      await expect(service.getOrCreateReputation(1, 'example.com')).rejects.toThrow('Failed to get or create reputation');
    });
  });

  describe('calculateReputation', () => {
    it('should calculate reputation score correctly', async () => {
      // Mock email events query
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          total_sent: '1000',
          total_bounced: '20',
          total_complained: '1',
          total_opened: '200',
          total_clicked: '50',
        }],
      });

      // Mock update query
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          user_id: 1,
          domain: 'example.com',
          reputation_score: 95,
          status: 'active',
          bounce_rate: 0.02,
          complaint_rate: 0.001,
          engagement_rate: 0.25,
        }],
      });

      const result = await service.calculateReputation(1, 'example.com');

      expect(result.bounceRate).toBe(0.02);
      expect(result.complaintRate).toBe(0.001);
      expect(result.engagementRate).toBe(0.25);
    });

    it('should set status to paused when bounce rate exceeds threshold', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          total_sent: '1000',
          total_bounced: '60', // 6% bounce rate
          total_complained: '0',
          total_opened: '100',
          total_clicked: '20',
        }],
      });

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          user_id: 1,
          domain: 'example.com',
          reputation_score: 50,
          status: 'paused',
          bounce_rate: 0.06,
          complaint_rate: 0,
          engagement_rate: 0.12,
          paused_reason: 'Bounce rate (6.00%) exceeds safe threshold (5%)',
        }],
      });

      const result = await service.calculateReputation(1, 'example.com');

      expect(result.status).toBe('paused');
      expect(result.pausedReason).toContain('Bounce rate');
    });

    it('should set status to paused when complaint rate exceeds threshold', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          total_sent: '1000',
          total_bounced: '10',
          total_complained: '2', // 0.2% complaint rate
          total_opened: '100',
          total_clicked: '20',
        }],
      });

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          user_id: 1,
          domain: 'example.com',
          reputation_score: 70,
          status: 'paused',
          bounce_rate: 0.01,
          complaint_rate: 0.002,
          engagement_rate: 0.12,
          paused_reason: 'Complaint rate (0.200%) exceeds safe threshold (0.1%)',
        }],
      });

      const result = await service.calculateReputation(1, 'example.com');

      expect(result.status).toBe('paused');
      expect(result.pausedReason).toContain('Complaint rate');
    });

    it('should set status to warning when rates are high but below pause threshold', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          total_sent: '1000',
          total_bounced: '40', // 4% bounce rate (warning threshold)
          total_complained: '0',
          total_opened: '100',
          total_clicked: '20',
        }],
      });

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          user_id: 1,
          domain: 'example.com',
          reputation_score: 60,
          status: 'warning',
          bounce_rate: 0.04,
          complaint_rate: 0,
          engagement_rate: 0.12,
        }],
      });

      const result = await service.calculateReputation(1, 'example.com');

      expect(result.status).toBe('warning');
    });

    it('should handle zero sent emails', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          total_sent: '0',
          total_bounced: '0',
          total_complained: '0',
          total_opened: '0',
          total_clicked: '0',
        }],
      });

      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          user_id: 1,
          domain: 'example.com',
          reputation_score: 100,
          status: 'active',
          bounce_rate: 0,
          complaint_rate: 0,
          engagement_rate: 0,
        }],
      });

      const result = await service.calculateReputation(1, 'example.com');

      expect(result.bounceRate).toBe(0);
      expect(result.complaintRate).toBe(0);
      expect(result.engagementRate).toBe(0);
    });
  });

  describe('canSend', () => {
    it('should return true for active domain', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          user_id: 1,
          domain: 'example.com',
          reputation_score: 90,
          status: 'active',
        }],
      });

      const result = await service.canSend(1, 'example.com');

      expect(result.canSend).toBe(true);
    });

    it('should return false for paused domain', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          user_id: 1,
          domain: 'example.com',
          reputation_score: 50,
          status: 'paused',
          paused_reason: 'Bounce rate too high',
        }],
      });

      const result = await service.canSend(1, 'example.com');

      expect(result.canSend).toBe(false);
      expect(result.reason).toContain('Bounce rate');
    });

    it('should fail closed on error', async () => {
      mockPool.query.mockRejectedValueOnce(new Error('Database error'));

      const result = await service.canSend(1, 'example.com');

      expect(result.canSend).toBe(false);
      expect(result.reason).toContain('Unable to verify');
    });
  });

  describe('resumeSending', () => {
    it('should resume paused domain', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{ id: 1 }],
      });

      await service.resumeSending(1, 'example.com');

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE domain_reputation'),
        expect.arrayContaining([1, 'example.com'])
      );
    });

    it('should throw error if domain not found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [] });

      await expect(service.resumeSending(1, 'example.com')).rejects.toThrow('No reputation record found');
    });
  });

  describe('mapRowToReputation', () => {
    it('should handle null values correctly', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          user_id: 1,
          domain: 'example.com',
          reputation_score: null,
          status: null,
          bounce_rate: null,
          complaint_rate: null,
          engagement_rate: null,
          total_sent: null,
          total_bounced: null,
          total_complained: null,
          total_opened: null,
          total_clicked: null,
        }],
      });

      const result = await service.getReputation(1, 'example.com');

      expect(result?.reputationScore).toBe(100); // Default
      expect(result?.status).toBe('active'); // Default
      expect(result?.bounceRate).toBe(0);
      expect(result?.totalSent).toBe(0);
    });

    it('should validate status enum', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 1,
          user_id: 1,
          domain: 'example.com',
          reputation_score: 100,
          status: 'invalid_status',
        }],
      });

      await expect(service.getReputation(1, 'example.com')).rejects.toThrow('Invalid status');
    });
  });
});

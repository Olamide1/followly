import { createClient } from 'redis';

let redisClient: ReturnType<typeof createClient> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;

export async function initializeRedis(): Promise<void> {
  try {
    const redisUrl = process.env.REDIS_URL || `redis://${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`;
    const isProduction = process.env.NODE_ENV === 'production';
    
    redisClient = createClient({
      url: redisUrl,
      // Heroku Redis uses TLS with self-signed certs
      socket: isProduction ? {
        tls: true,
        rejectUnauthorized: false,
        reconnectStrategy: (retries: number) => {
          // Exponential backoff: 50ms, 100ms, 200ms, 400ms, 800ms, 1600ms, 3200ms, max 5000ms
          const delay = Math.min(50 * Math.pow(2, retries), 5000);
          if (retries > MAX_RECONNECT_ATTEMPTS) {
            console.error(`[Redis] Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Stopping reconnection.`);
            return false; // Stop trying to reconnect
          }
          console.log(`[Redis] Reconnecting... attempt ${retries + 1}/${MAX_RECONNECT_ATTEMPTS} (delay: ${delay}ms)`);
          return delay;
        },
        connectTimeout: 10000, // 10 second timeout
      } : {
        reconnectStrategy: (retries: number) => {
          const delay = Math.min(50 * Math.pow(2, retries), 5000);
          if (retries > MAX_RECONNECT_ATTEMPTS) {
            console.error(`[Redis] Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Stopping reconnection.`);
            return false;
          }
          console.log(`[Redis] Reconnecting... attempt ${retries + 1}/${MAX_RECONNECT_ATTEMPTS} (delay: ${delay}ms)`);
          return delay;
        },
        connectTimeout: 10000,
      },
    });

    // Handle connection events
    redisClient.on('error', (err) => {
      console.error('[Redis] Client Error:', err.message || err);
      reconnectAttempts++;
    });

    redisClient.on('connect', () => {
      console.log('[Redis] Connecting...');
      reconnectAttempts = 0; // Reset on successful connection
    });

    redisClient.on('ready', () => {
      console.log('✅ Redis connected and ready');
      reconnectAttempts = 0;
    });

    redisClient.on('reconnecting', () => {
      console.log('[Redis] Reconnecting...');
    });

    redisClient.on('end', () => {
      console.warn('[Redis] Connection ended');
    });

    await redisClient.connect();
    console.log('✅ Redis connected');
  } catch (error) {
    console.error('Redis connection error:', error);
    throw error;
  }
}

export function getRedisClient() {
  if (!redisClient) {
    throw new Error('Redis client not initialized');
  }
  return redisClient;
}


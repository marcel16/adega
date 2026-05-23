import { createClient, RedisClientType } from 'redis';

let redisClient: RedisClientType | null = null;

export async function getRedisClient(): Promise<RedisClientType> {
  if (redisClient?.isOpen) return redisClient;

  const url = process.env.REDIS_URL || 'redis://localhost:6379';

  redisClient = createClient({
    url,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) {
          console.error('[Redis] Max retries reached, giving up');
          return new Error('Max retries reached');
        }
        return Math.min(retries * 200, 5000);
      },
    },
  });

  redisClient.on('error', (err) => {
    console.error('[Redis] Client error:', err.message);
  });

  redisClient.on('connect', () => {
    console.log('[Redis] Connected');
  });

  await redisClient.connect();
  return redisClient;
}

export async function closeRedis(): Promise<void> {
  if (redisClient?.isOpen) {
    await redisClient.quit();
    redisClient = null;
  }
}

export function getRedisClientSync(): RedisClientType | null {
  return redisClient?.isOpen ? redisClient : null;
}

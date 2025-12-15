/**
 * Redis Configuration
 * Used for BullMQ job queues (thumbnail generation, etc.)
 */

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
}

export const getRedisConfig = (): RedisConfig => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB || '0', 10),
});

/**
 * BullMQ connection options
 */
export const getBullMQConnection = () => {
  const config = getRedisConfig();
  return {
    host: config.host,
    port: config.port,
    password: config.password,
    db: config.db,
  };
};

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  namespace?: string; // Cache namespace for organization
}

@Injectable()
export class RedisCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisCacheService.name);
  private redis: Redis;
  private readonly defaultTtl = 300; // 5 minutes default
  private readonly keyPrefix = 'cache:';

  constructor(private readonly configService: ConfigService) { }

  async onModuleInit() {
    try {
      // ✅ OPTIMIZED: Simple but efficient Redis connection config
      this.redis = new Redis({
        host: this.configService.get('REDIS_HOST', 'localhost'),
        port: this.configService.get('REDIS_PORT', 6379),
        // ✅ PERFORMANCE: Basic optimized settings for high traffic
        maxRetriesPerRequest: 3,
        lazyConnect: true,
        keyPrefix: this.keyPrefix,
      });
      this.logger.log('Redis cache service connected successfully');
    } catch (error) {
      this.logger.error('Failed to connect to Redis cache', error);
      throw error;
    }
  }

  async onModuleDestroy() {
    if (this.redis) {
      this.redis.disconnect();
      this.logger.log('Redis cache service disconnected');
    }
  }

  /**
   * ✅ OPTIMIZED: High-performance cache set with automatic serialization
   */
  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    try {
      const finalKey = this.buildKey(key, options.namespace);
      const ttl = options.ttl || this.defaultTtl;

      // ✅ PERFORMANCE: Fast JSON serialization
      const serializedValue = JSON.stringify(value);

      // ✅ PERFORMANCE: Single Redis command with TTL
      await this.redis.setex(finalKey, ttl, serializedValue);

      this.logger.debug(`Cache SET: ${finalKey} (TTL: ${ttl}s)`);
    } catch (error) {
      this.logger.error(`Cache SET failed for key: ${key}`, error);
      // ✅ RELIABILITY: Don't throw on cache failures to prevent app crashes
    }
  }

  /**
   * ✅ OPTIMIZED: High-performance cache get with automatic deserialization
   */
  async get<T>(key: string, namespace?: string): Promise<T | null> {
    try {
      const finalKey = this.buildKey(key, namespace);
      const value = await this.redis.get(finalKey);

      if (!value) {
        this.logger.debug(`Cache MISS: ${finalKey}`);
        return null;
      }

      this.logger.debug(`Cache HIT: ${finalKey}`);
      return JSON.parse(value) as T;
    } catch (error) {
      this.logger.error(`Cache GET failed for key: ${key}`, error);
      return null; // ✅ RELIABILITY: Return null on cache failures
    }
  }

  /**
   * ✅ OPTIMIZED: Efficient cache deletion
   */
  async delete(key: string, namespace?: string): Promise<boolean> {
    try {
      const finalKey = this.buildKey(key, namespace);
      const result = await this.redis.del(finalKey);

      this.logger.debug(`Cache DELETE: ${finalKey} (deleted: ${result > 0})`);
      return result > 0;
    } catch (error) {
      this.logger.error(`Cache DELETE failed for key: ${key}`, error);
      return false;
    }
  }

  /**
   * ✅ OPTIMIZED: Bulk delete with pattern matching for cache invalidation
   */
  async deletePattern(pattern: string, namespace?: string): Promise<number> {
    try {
      const finalPattern = this.buildKey(pattern, namespace);
      const keys = await this.redis.keys(finalPattern);

      if (keys.length === 0) {
        return 0;
      }

      // ✅ PERFORMANCE: Bulk delete in single command
      const result = await this.redis.del(...keys);

      this.logger.debug(`Cache DELETE PATTERN: ${finalPattern} (deleted: ${result} keys)`);
      return result;
    } catch (error) {
      this.logger.error(`Cache DELETE PATTERN failed for pattern: ${pattern}`, error);
      return 0;
    }
  }

  /**
   * ✅ OPTIMIZED: Check if key exists without fetching value
   */
  async exists(key: string, namespace?: string): Promise<boolean> {
    try {
      const finalKey = this.buildKey(key, namespace);
      const result = await this.redis.exists(finalKey);
      return result === 1;
    } catch (error) {
      this.logger.error(`Cache EXISTS failed for key: ${key}`, error);
      return false;
    }
  }

  /**
   * ✅ OPTIMIZED: Get or set pattern for cache-aside strategy
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    options: CacheOptions = {}
  ): Promise<T> {
    // Try to get from cache first
    const cached = await this.get<T>(key, options.namespace);
    if (cached !== null) {
      return cached;
    }

    // Cache miss - fetch from source
    const value = await factory();

    // Set in cache for next time
    await this.set(key, value, options);

    return value;
  }

  /**
   * ✅ PERFORMANCE: Efficient key building with namespace support
   */
  private buildKey(key: string, namespace?: string): string {
    return namespace ? `${namespace}:${key}` : key;
  }

  /**
   * ✅ MONITORING: Get cache statistics for monitoring
   */
  async getStats(): Promise<{ connected: boolean; memory: string; keys: number }> {
    try {
      const info = await this.redis.info('memory');
      const dbsize = await this.redis.dbsize();

      return {
        connected: this.redis.status === 'ready',
        memory: info.split('\r\n').find(line => line.startsWith('used_memory_human:'))?.split(':')[1] || 'unknown',
        keys: dbsize,
      };
    } catch (error) {
      return { connected: false, memory: 'unknown', keys: 0 };
    }
  }
}

import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisCacheService } from './services/redis-cache.service';
import { RateLimitingService } from './services/rate-limiting.service';
import { ErrorSanitizationService } from './services/error-sanitization.service';
import { QueryPerformanceService } from './services/query-performance.service';
import { GlobalExceptionFilter } from './filters/global-exception.filter';

@Module({
  imports: [ConfigModule],
  providers: [
    RedisCacheService,
    RateLimitingService,
    ErrorSanitizationService,
    QueryPerformanceService,
    GlobalExceptionFilter,
  ],
  exports: [
    RedisCacheService,
    RateLimitingService,
    ErrorSanitizationService,
    QueryPerformanceService,
    GlobalExceptionFilter,
  ],
})
export class CommonModule { }

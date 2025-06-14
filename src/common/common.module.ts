import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisCacheService } from './services/redis-cache.service';
import { RateLimitingService } from './services/rate-limiting.service';
import { ErrorSanitizationService } from './services/error-sanitization.service';
import { QueryPerformanceService } from './services/query-performance.service';
import { GlobalExceptionFilter } from './filters/global-exception.filter';
import { RateLimitGuard } from './guards/rate-limit.guard';

@Module({
  imports: [ConfigModule],
  providers: [
    RedisCacheService,
    RateLimitingService,
    ErrorSanitizationService,
    QueryPerformanceService,
    GlobalExceptionFilter,
    RateLimitGuard,
  ],
  exports: [
    RedisCacheService,
    RateLimitingService,
    ErrorSanitizationService,
    QueryPerformanceService,
    GlobalExceptionFilter,
    RateLimitGuard,
  ],
})
export class CommonModule { }

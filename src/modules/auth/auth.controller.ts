import { Body, Controller, Post, Req, HttpCode, HttpStatus, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { RefreshTokenDto, TokenResponseDto } from './dto/refresh-token.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Request } from 'express';
import { RateLimitGuard } from '../../common/guards/rate-limit.guard';
import { RateLimit } from '../../common/decorators/rate-limit.decorator';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) { }

  @Post('login')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 5, windowMs: 60000 }) // 5 login attempts per minute per IP/user
  @ApiOperation({ summary: 'Login user and get access/refresh tokens' })
  @ApiResponse({ status: 200, description: 'Login successful', type: TokenResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 429, description: 'Too many login attempts' })
  async login(@Body() loginDto: LoginDto, @Req() request: Request): Promise<TokenResponseDto> {
    const deviceInfo = {
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip,
    };
    return this.authService.login(loginDto, deviceInfo);
  }

  @Post('register')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 3, windowMs: 300000 }) // 3 registration attempts per 5 minutes per IP
  @ApiOperation({ summary: 'Register new user and get access/refresh tokens' })
  @ApiResponse({ status: 201, description: 'Registration successful', type: TokenResponseDto })
  @ApiResponse({ status: 400, description: 'Email already exists' })
  @ApiResponse({ status: 429, description: 'Too many registration attempts' })
  async register(@Body() registerDto: RegisterDto, @Req() request: Request): Promise<TokenResponseDto> {
    const deviceInfo = {
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip,
    };
    return this.authService.register(registerDto, deviceInfo);
  }

  @Post('refresh') 
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 10, windowMs: 60000 }) // 10 refresh attempts per minute per IP
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({ status: 200, description: 'Token refreshed successfully', type: TokenResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  @ApiResponse({ status: 429, description: 'Too many refresh attempts' })
  async refreshToken(@Body() refreshTokenDto: RefreshTokenDto): Promise<TokenResponseDto> {
    return this.authService.refreshToken(refreshTokenDto);
  }

  @Post('logout')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 20, windowMs: 60000 }) // 20 logout attempts per minute per IP
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Logout user and revoke refresh token' })
  @ApiResponse({ status: 204, description: 'Logout successful' })
  @ApiResponse({ status: 429, description: 'Too many logout attempts' })
  async logout(@Body() refreshTokenDto: RefreshTokenDto): Promise<void> {
    await this.authService.logout(refreshTokenDto.refreshToken);
  }
}
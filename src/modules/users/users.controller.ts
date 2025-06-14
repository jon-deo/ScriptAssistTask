import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, ClassSerializerInterceptor, UseInterceptors, ForbiddenException, HttpCode, HttpStatus } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { ApiBearerAuth, ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('users')
@Controller('users')
@UseInterceptors(ClassSerializerInterceptor)
export class UsersController {
  constructor(private readonly usersService: UsersService) { }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @Post()
  @ApiOperation({ summary: 'Create a new user (admin only)' })
  @ApiResponse({ status: 201, description: 'User created successfully', type: UserResponseDto })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async create(@Body() createUserDto: CreateUserDto): Promise<UserResponseDto> {
    // ✅ AUTHORIZATION: Only admins can create users
    const user = await this.usersService.create(createUserDto);
    return new UserResponseDto(user);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @Get()
  @ApiOperation({ summary: 'Get all users (admin only)' })
  @ApiResponse({ status: 200, description: 'Users retrieved successfully', type: [UserResponseDto] })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  async findAll(): Promise<UserResponseDto[]> {
    // ✅ AUTHORIZATION: Only admins can view all users
    const users = await this.usersService.findAll();
    return users.map(user => new UserResponseDto(user));
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID (users can only access their own data, admins can access any user)' })
  @ApiResponse({ status: 200, description: 'User found successfully', type: UserResponseDto })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({ status: 403, description: 'Access denied - can only access your own data' })
  @ApiResponse({ status: 404, description: 'User not found or invalid UUID format' })
  async findOne(@Param('id') id: string, @CurrentUser() user: any): Promise<UserResponseDto> {
    // ✅ AUTHORIZATION: Users can only access their own data, admins can access any user
    if (user.role !== 'admin' && user.id !== id) {
      throw new ForbiddenException('Access denied - you can only access your own data');
    }
    const foundUser = await this.usersService.findOne(id);
    return new UserResponseDto(foundUser);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch(':id')
  @ApiOperation({ summary: 'Update user by ID (users can only update their own data, admins can update any user)' })
  @ApiResponse({ status: 200, description: 'User updated successfully', type: UserResponseDto })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({ status: 403, description: 'Access denied - can only update your own data or role changes require admin' })
  @ApiResponse({ status: 404, description: 'User not found or invalid UUID format' })
  async update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto, @CurrentUser() user: any): Promise<UserResponseDto> {
    // ✅ AUTHORIZATION: Users can only update their own data, admins can update any user
    if (user.role !== 'admin' && user.id !== id) {
      throw new ForbiddenException('Access denied - you can only update your own data');
    }

    // ✅ SECURITY: Prevent role escalation - only admins can change roles
    if (updateUserDto.role && user.role !== 'admin') {
      throw new ForbiddenException('Access denied - only administrators can change user roles');
    }

    const updatedUser = await this.usersService.update(id, updateUserDto);
    return new UserResponseDto(updatedUser);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete user by ID (admin only)' })
  @ApiResponse({ status: 200, description: 'User deleted successfully' })
  @ApiResponse({ status: 400, description: 'Cannot delete user with related records' })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({ status: 403, description: 'Admin access required' })
  @ApiResponse({ status: 404, description: 'User not found or invalid UUID format' })
  async remove(@Param('id') id: string): Promise<{ message: string }> {
    // ✅ AUTHORIZATION: Only admins can delete users
    await this.usersService.remove(id);
    return { message: 'User deleted successfully' };
  }
} 
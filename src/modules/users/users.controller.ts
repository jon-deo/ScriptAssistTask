import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, ClassSerializerInterceptor, UseInterceptors, ForbiddenException } from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
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

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @Get()
  findAll() {
    // ✅ AUTHORIZATION: Only admins can view all users
    return this.usersService.findAll();
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get(':id')
  @ApiOperation({ summary: 'Get user by ID (users can only access their own data, admins can access any user)' })
  @ApiResponse({ status: 200, description: 'User found successfully' })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({ status: 403, description: 'Access denied - can only access your own data' })
  @ApiResponse({ status: 404, description: 'User not found or invalid UUID format' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    // ✅ AUTHORIZATION: Users can only access their own data, admins can access any user
    if (user.role !== 'admin' && user.id !== id) {
      throw new ForbiddenException('Access denied - you can only access your own data');
    }
    return this.usersService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Patch(':id')
  @ApiOperation({ summary: 'Update user by ID (users can only update their own data, admins can update any user)' })
  @ApiResponse({ status: 200, description: 'User updated successfully' })
  @ApiResponse({ status: 401, description: 'Authentication required' })
  @ApiResponse({ status: 403, description: 'Access denied - can only update your own data' })
  @ApiResponse({ status: 404, description: 'User not found or invalid UUID format' })
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto, @CurrentUser() user: any) {
    // ✅ AUTHORIZATION: Users can only update their own data, admins can update any user
    if (user.role !== 'admin' && user.id !== id) {
      throw new ForbiddenException('Access denied - you can only update your own data');
    }
    return this.usersService.update(id, updateUserDto);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth()
  @Delete(':id')
  remove(@Param('id') id: string) {
    // ✅ AUTHORIZATION: Only admins can delete users
    return this.usersService.remove(id);
  }
} 
import { Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './entities/user.entity';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { RedisCacheService } from '../../common/services/redis-cache.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private readonly cacheService: RedisCacheService,
  ) { }

  async create(createUserDto: CreateUserDto): Promise<User> {
    // Check if user with this email already exists
    const existingUser = await this.findByEmail(createUserDto.email);
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const user = this.usersRepository.create({
      ...createUserDto,
      password: hashedPassword,
    });
    return this.usersRepository.save(user);
  }

  findAll(): Promise<User[]> {
    return this.usersRepository.find();
  }

  async findOne(id: string): Promise<User> {
    // Validate UUID format first
    if (!this.isValidUUID(id)) {
      throw new NotFoundException('User not found');
    }

    // ✅ OPTIMIZED: Cache user profiles for 5 minutes (frequently accessed, rarely changed)
    return this.cacheService.getOrSet(
      `user:${id}`,
      async () => {
        const user = await this.usersRepository.findOne({ where: { id } });
        if (!user) {
          throw new NotFoundException('User not found');
        }
        return user;
      },
      { ttl: 300, namespace: 'users' } // 5 minutes TTL
    );
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { email } });
  }

  async update(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    // Validate UUID format first
    if (!this.isValidUUID(id)) {
      throw new NotFoundException('User not found');
    }

    const user = await this.findOne(id);

    if (updateUserDto.password) {
      updateUserDto.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    this.usersRepository.merge(user, updateUserDto);
    const updatedUser = await this.usersRepository.save(user);

    // ✅ CACHE INVALIDATION: Clear user cache when updated
    await this.cacheService.delete(`user:${id}`, 'users');

    return updatedUser;
  }

  async remove(id: string, currentUserId?: string): Promise<void> {
    // Validate UUID format first
    if (!this.isValidUUID(id)) {
      throw new NotFoundException('User not found');
    }

    const user = await this.findOne(id);

    // ✅ SECURITY: Prevent self-deletion
    if (currentUserId && id === currentUserId) {
      throw new ForbiddenException('You cannot delete your own account');
    }

    // ✅ SECURITY: Prevent admin from deleting other admins
    if (user.role === 'admin') {
      throw new ForbiddenException('Cannot delete admin users. Contact system administrator.');
    }

    try {
      await this.usersRepository.remove(user);

      // ✅ CACHE INVALIDATION: Clear user cache when deleted
      await this.cacheService.delete(`user:${id}`, 'users');
    } catch (error: any) {
      // Handle foreign key constraint violations
      if (error.code === '23503' || error.message?.includes('foreign key constraint')) {
        throw new BadRequestException(
          'Cannot delete user because they have related records. Please remove or transfer their data first.'
        );
      }

      // Re-throw other database errors
      throw error;
    }
  }

  /**
   * Validate if a string is a valid UUID format
   */
  private isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }
}
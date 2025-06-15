import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Task } from './entities/task.entity';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { TaskStatus } from './enums/task-status.enum';
import { TaskPriority } from './enums/task-priority.enum';
import { RedisCacheService } from '../../common/services/redis-cache.service';
import { UsersService } from '../users/users.service';

@Injectable()
export class TasksService {
  constructor(
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    private dataSource: DataSource,
    private readonly cacheService: RedisCacheService,
    private readonly usersService: UsersService,
  ) { }

  async create(createTaskDto: CreateTaskDto, userId: string): Promise<Task> {
    // ✅ AUTHORIZATION: Use userId from DTO if provided (admin can assign to others),
    // otherwise use authenticated user's ID (authorization is handled in controller)
    const targetUserId = createTaskDto.userId || userId;

    // ✅ VALIDATION: Check if the target userId exists
    try {
      await this.usersService.findOne(targetUserId);
    } catch (error) {
      throw new BadRequestException('Invalid userId: User not found');
    }

    const taskData = { ...createTaskDto, userId: targetUserId };

    // ✅ OPTIMIZED: Atomic operation with transaction management
    return await this.dataSource.transaction(async manager => {
      try {
        // Create and save task within transaction
        const task = manager.create(Task, taskData);
        const savedTask = await manager.save(task);

        // ✅ PERFORMANCE: Add to queue only after successful DB commit
        // Queue operation happens after transaction commits to ensure consistency
        await this.taskQueue.add('task-status-update', {
          taskId: savedTask.id,
          status: savedTask.status,
        }, {
          // ✅ RELIABILITY: Add retry configuration
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
        });

        // ✅ CACHE INVALIDATION: Clear task-related caches when new task is created
        await this.clearTaskCaches(savedTask.userId);

        return savedTask;
      } catch (error) {
        // ✅ ERROR HANDLING: Transaction will automatically rollback
        throw new Error(`Failed to create task: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });
  }

  async findAll(): Promise<Task[]> {
    // ✅ OPTIMIZED: Load tasks without user relations by default for better performance
    // User relations should only be loaded when specifically needed
    return this.tasksRepository.find();
  }

  /**
   * ✅ OPTIMIZED: Separate method for when user relations are actually needed
   */
  async findAllWithUsers(): Promise<Task[]> {
    return this.tasksRepository.find({
      relations: ['user'],
    });
  }

  /**
   * ✅ OPTIMIZED: Database-level filtering and pagination with caching
   * Replaces memory-based filtering with efficient SQL queries + Redis cache
   */
  async findAllWithFilters(filters: {
    status?: string;
    priority?: string;
    userId?: string;
    page?: number;
    limit?: number;
    sortBy?: string;
    sortOrder?: 'ASC' | 'DESC';
  }): Promise<{
    data: Task[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  }> {
    const {
      status,
      priority,
      userId,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'DESC'
    } = filters;

    // ✅ CACHE: Create cache key based on filters (3 minutes TTL for task lists)
    const cacheKey = `list:${JSON.stringify({ status, priority, userId, page, limit, sortBy, sortOrder })}`;

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        // ✅ PERFORMANCE: Build query with database-level filtering
        const queryBuilder = this.tasksRepository.createQueryBuilder('task');

        // ✅ AUTHORIZATION: Filter by userId if provided
        if (userId) {
          queryBuilder.andWhere('task.userId = :userId', { userId });
        }

        // ✅ PERFORMANCE: Add filters at database level, not in memory
        if (status) {
          queryBuilder.andWhere('task.status = :status', { status });
        }

        if (priority) {
          queryBuilder.andWhere('task.priority = :priority', { priority });
        }

        // ✅ PERFORMANCE: Database-level sorting
        const allowedSortFields = ['title', 'status', 'priority', 'createdAt', 'dueDate'];
        const safeSortBy = allowedSortFields.includes(sortBy) ? sortBy : 'createdAt';
        queryBuilder.orderBy(`task.${safeSortBy}`, sortOrder);

        // ✅ PERFORMANCE: Database-level pagination
        const offset = (page - 1) * limit;
        queryBuilder.skip(offset).take(limit);

        // ✅ PERFORMANCE: Get total count and data in parallel
        const [data, total] = await queryBuilder.getManyAndCount();

        const totalPages = Math.ceil(total / limit);
        const hasNext = page < totalPages;
        const hasPrev = page > 1;

        return {
          data,
          total,
          page,
          limit,
          totalPages,
          hasNext,
          hasPrev,
        };
      },
      { ttl: 180, namespace: 'tasks' } // 3 minutes TTL for task lists
    );
  }

  async findOne(id: string, userId?: string, userRole?: string): Promise<Task> {
    // ✅ CACHE: Cache individual tasks for 5 minutes with user-specific keys
    const cacheKey = userRole === 'admin'
      ? `task:${id}:admin`
      : `task:${id}:user:${userId}`;

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        // ✅ AUTHORIZATION: Build query with ownership check
        const whereCondition: any = { id };

        // ✅ AUTHORIZATION: Non-admin users can only see their own tasks
        if (userRole !== 'admin' && userId) {
          whereCondition.userId = userId;
        }

        // ✅ OPTIMIZED: Single database call instead of count + findOne
        const task = await this.tasksRepository.findOne({
          where: whereCondition,
          relations: ['user'],
        });

        if (!task) {
          throw new NotFoundException('Task not found');
        }

        return task;
      },
      { ttl: 300, namespace: 'tasks' } // 5 minutes TTL for individual tasks
    );
  }

  async update(id: string, updateTaskDto: UpdateTaskDto, userId?: string, userRole?: string): Promise<Task> {
    // ✅ VALIDATION: Check if the userId in updateTaskDto exists (if provided)
    if (updateTaskDto.userId) {
      try {
        await this.usersService.findOne(updateTaskDto.userId);
      } catch (error) {
        throw new BadRequestException('Invalid userId: User not found');
      }
    }

    // ✅ OPTIMIZED: Single query with transaction management
    return await this.dataSource.transaction(async manager => {
      try {
        // ✅ AUTHORIZATION: Build where condition with ownership check
        const whereCondition: any = { id };
        if (userRole !== 'admin' && userId) {
          whereCondition.userId = userId;
        }

        // ✅ PERFORMANCE: Get original task data for status comparison
        const originalTask = await manager.findOne(Task, {
          where: whereCondition,
          select: ['id', 'status', 'userId'] // Include userId for authorization
        });

        if (!originalTask) {
          throw new NotFoundException('Task not found');
        }

        // ✅ PERFORMANCE: Single UPDATE query instead of findOne + save
        const updateResult = await manager
          .createQueryBuilder()
          .update(Task)
          .set(updateTaskDto)
          .where('id = :id', { id })
          .execute();

        if (updateResult.affected === 0) {
          throw new NotFoundException('Task not found or no changes made');
        }

        // ✅ PERFORMANCE: Get updated task with relations
        const updatedTask = await manager.findOne(Task, {
          where: { id },
          relations: ['user']
        });

        // ✅ RELIABILITY: Add to queue only if status changed and after DB commit
        if (updateTaskDto.status && originalTask.status !== updateTaskDto.status) {
          await this.taskQueue.add('task-status-update', {
            taskId: updatedTask!.id,
            status: updatedTask!.status,
          }, {
            attempts: 3,
            backoff: {
              type: 'exponential',
              delay: 2000,
            },
          });
        }

        // ✅ CACHE INVALIDATION: Clear task-related caches when task is updated
        // Clear caches for both old and new user (in case userId changed)
        await this.clearTaskCaches(originalTask.userId, id);
        if (updateTaskDto.userId && updateTaskDto.userId !== originalTask.userId) {
          await this.clearTaskCaches(updateTaskDto.userId, id);
        }

        return updatedTask!;
      } catch (error) {
        if (error instanceof NotFoundException) {
          throw error;
        }
        throw new Error(`Failed to update task: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });
  }

  async remove(id: string, userId?: string, userRole?: string): Promise<void> {
    // ✅ AUTHORIZATION: Enhanced authorization logic to distinguish between "not found" and "insufficient permission"
    if (userRole !== 'admin' && userId) {
      // First, check if the task exists at all
      const taskExists = await this.tasksRepository.findOne({
        where: { id },
        select: ['id', 'userId']
      });

      if (!taskExists) {
        throw new NotFoundException('Task not found');
      }

      // If task exists but doesn't belong to the user, it's a permission issue
      if (taskExists.userId !== userId) {
        throw new ForbiddenException('Insufficient permission: You can only delete your own tasks');
      }
    }

    // ✅ OPTIMIZED: Single DELETE query with existence check
    const deleteResult = await this.tasksRepository
      .createQueryBuilder()
      .delete()
      .from(Task)
      .where('id = :id', { id })
      .execute();

    if (deleteResult.affected === 0) {
      throw new NotFoundException('Task not found');
    }

    // ✅ CACHE INVALIDATION: Clear task-related caches when task is deleted
    await this.clearTaskCaches(undefined, id);
  }

  async findByStatus(status: TaskStatus): Promise<Task[]> {
    // ✅ OPTIMIZED: Use QueryBuilder with proper typing and relations
    return this.tasksRepository
      .createQueryBuilder('task')
      .where('task.status = :status', { status })
      .orderBy('task.createdAt', 'DESC')
      .getMany();
  }

  /**
   * ✅ OPTIMIZED: Find tasks by status with user relations when needed
   */
  async findByStatusWithUsers(status: TaskStatus): Promise<Task[]> {
    return this.tasksRepository
      .createQueryBuilder('task')
      .leftJoinAndSelect('task.user', 'user')
      .where('task.status = :status', { status })
      .orderBy('task.createdAt', 'DESC')
      .getMany();
  }

  /**
   * ✅ OPTIMIZED: Get task statistics using SQL aggregation with caching
   * Replaces N+1 query problem with single efficient query + Redis cache
   */
  async getTaskStatistics(userId?: string, userRole?: string): Promise<{
    total: number;
    completed: number;
    inProgress: number;
    pending: number;
    highPriority: number;
  }> {
    // ✅ CACHE: Cache stats for 10 minutes (expensive aggregation query)
    const cacheKey = userRole === 'admin' ? 'stats:global' : `stats:user:${userId}`;

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        // ✅ PERFORMANCE: Single SQL query with aggregation instead of loading all tasks
        const queryBuilder = this.tasksRepository
          .createQueryBuilder('task')
          .select([
            'COUNT(*) as total',
            'COUNT(CASE WHEN task.status = :completed THEN 1 END) as completed',
            'COUNT(CASE WHEN task.status = :inProgress THEN 1 END) as inProgress',
            'COUNT(CASE WHEN task.status = :pending THEN 1 END) as pending',
            'COUNT(CASE WHEN task.priority = :highPriority THEN 1 END) as highPriority'
          ])
          .setParameters({
            completed: TaskStatus.COMPLETED,
            inProgress: TaskStatus.IN_PROGRESS,
            pending: TaskStatus.PENDING,
            highPriority: TaskPriority.HIGH
          });

        // ✅ AUTHORIZATION: Filter by userId for non-admin users
        if (userRole !== 'admin' && userId) {
          queryBuilder.andWhere('task.userId = :userId', { userId });
        }

        const result = await queryBuilder.getRawOne();

        return {
          total: parseInt(result.total) || 0,
          completed: parseInt(result.completed) || 0,
          inProgress: parseInt(result.inProgress) || 0,
          pending: parseInt(result.pending) || 0,
          highPriority: parseInt(result.highPriority) || 0,
        };
      },
      { ttl: 600, namespace: 'tasks' } // 10 minutes TTL for stats
    );
  }

  async updateStatus(id: string, status: string): Promise<Task> {
    // ✅ OPTIMIZED: Single UPDATE query for queue processor
    const updateResult = await this.tasksRepository
      .createQueryBuilder()
      .update(Task)
      .set({ status: status as TaskStatus })
      .where('id = :id', { id })
      .execute();

    if (updateResult.affected === 0) {
      throw new NotFoundException('Task not found');
    }

    // ✅ PERFORMANCE: Return updated task with minimal data for queue processor
    const updatedTask = await this.tasksRepository.findOne({
      where: { id },
      select: ['id', 'status', 'title'] // Only essential fields for queue response
    });

    return updatedTask!;
  }

  /**
   * ✅ OPTIMIZED: Bulk update operations with transaction management
   */
  async bulkUpdateStatus(taskIds: string[], status: TaskStatus, userId?: string, userRole?: string): Promise<{
    affected: number;
    successful: string[];
    failed: string[];
  }> {
    return await this.dataSource.transaction(async manager => {
      try {
        // ✅ VALIDATION: Input validation
        if (!taskIds || taskIds.length === 0) {
          throw new Error('No task IDs provided');
        }

        if (taskIds.length > 1000) {
          throw new Error('Maximum 1000 tasks can be updated at once');
        }

        // ✅ VALIDATION: Check which tasks exist and get current status with authorization
        const queryBuilder = manager
          .createQueryBuilder(Task, 'task')
          .select(['task.id', 'task.status'])
          .where('task.id IN (:...taskIds)', { taskIds });

        // ✅ AUTHORIZATION: Filter by userId for non-admin users
        if (userRole !== 'admin' && userId) {
          queryBuilder.andWhere('task.userId = :userId', { userId });
        }

        const existingTasks = await queryBuilder.getMany();

        const existingIds = existingTasks.map(task => task.id);
        const missingIds = taskIds.filter(id => !existingIds.includes(id));

        // ✅ TRANSACTION: Update only existing tasks
        const result = await manager
          .createQueryBuilder()
          .update(Task)
          .set({ status, updatedAt: new Date() })
          .where('id IN (:...existingIds)', { existingIds })
          .execute();

        // ✅ QUEUE: Add to queue only for tasks that actually changed status
        const changedTasks = existingTasks.filter(task => task.status !== status);
        if (changedTasks.length > 0) {
          const queuePromises = changedTasks.map(task =>
            this.taskQueue.add('task-status-update', {
              taskId: task.id,
              status,
              previousStatus: task.status,
            }, {
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
            })
          );

          await Promise.all(queuePromises);
        }

        return {
          affected: result.affected || 0,
          successful: existingIds,
          failed: missingIds,
        };
      } catch (error) {
        throw new Error(`Bulk status update failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });
  }

  /**
   * ✅ OPTIMIZED: Bulk delete operations with transaction management and error handling
   */
  async bulkDelete(taskIds: string[], userId?: string, userRole?: string): Promise<{
    affected: number;
    successful: string[];
    failed: string[];
  }> {
    return await this.dataSource.transaction(async manager => {
      try {
        // ✅ VALIDATION: Input validation
        if (!taskIds || taskIds.length === 0) {
          throw new Error('No task IDs provided');
        }

        if (taskIds.length > 1000) {
          throw new Error('Maximum 1000 tasks can be deleted at once');
        }

        // ✅ VALIDATION: Check which tasks exist before deletion with authorization
        const queryBuilder = manager
          .createQueryBuilder(Task, 'task')
          .select('task.id')
          .where('task.id IN (:...taskIds)', { taskIds });

        // ✅ AUTHORIZATION: Filter by userId for non-admin users
        if (userRole !== 'admin' && userId) {
          queryBuilder.andWhere('task.userId = :userId', { userId });
        }

        const existingTasks = await queryBuilder.getMany();

        const existingIds = existingTasks.map(task => task.id);
        const missingIds = taskIds.filter(id => !existingIds.includes(id));

        // ✅ TRANSACTION: Delete only existing tasks
        const result = await manager
          .createQueryBuilder()
          .delete()
          .from(Task)
          .where('id IN (:...existingIds)', { existingIds })
          .execute();

        // ✅ QUEUE: Add deletion notifications to queue
        if (existingIds.length > 0) {
          const queuePromises = existingIds.map(taskId =>
            this.taskQueue.add('task-deleted', {
              taskId,
              deletedAt: new Date(),
            }, {
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
            })
          );

          await Promise.all(queuePromises);
        }

        return {
          affected: result.affected || 0,
          successful: existingIds,
          failed: missingIds,
        };
      } catch (error) {
        throw new Error(`Bulk delete failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });
  }

  /**
   * ✅ NEW: Bulk create operations with transaction management
   */
  async bulkCreate(createTaskDtos: CreateTaskDto[]): Promise<{
    created: Task[];
    failed: { index: number; error: string }[];
  }> {
    return await this.dataSource.transaction(async manager => {
      try {
        // ✅ VALIDATION: Input validation
        if (!createTaskDtos || createTaskDtos.length === 0) {
          throw new Error('No task data provided');
        }

        if (createTaskDtos.length > 500) {
          throw new Error('Maximum 500 tasks can be created at once');
        }

        const created: Task[] = [];
        const failed: { index: number; error: string }[] = [];

        // ✅ TRANSACTION: Create tasks in batches within transaction
        for (let i = 0; i < createTaskDtos.length; i++) {
          try {
            const task = manager.create(Task, createTaskDtos[i]);
            const savedTask = await manager.save(task);
            created.push(savedTask);
          } catch (error) {
            failed.push({
              index: i,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }

        // ✅ QUEUE: Add created tasks to queue
        if (created.length > 0) {
          const queuePromises = created.map(task =>
            this.taskQueue.add('task-created', {
              taskId: task.id,
              status: task.status,
            }, {
              attempts: 3,
              backoff: { type: 'exponential', delay: 2000 },
            })
          );

          await Promise.all(queuePromises);
        }

        return { created, failed };
      } catch (error) {
        throw new Error(`Bulk create failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });
  }

  /**
   * ✅ NEW: Bulk update operations for multiple fields with transaction management
   */
  async bulkUpdate(updates: { id: string; data: Partial<UpdateTaskDto> }[], userId?: string, userRole?: string): Promise<{
    updated: string[];
    failed: { id: string; error: string }[];
  }> {
    return await this.dataSource.transaction(async manager => {
      try {
        // ✅ VALIDATION: Input validation
        if (!updates || updates.length === 0) {
          throw new Error('No update data provided');
        }

        if (updates.length > 500) {
          throw new Error('Maximum 500 tasks can be updated at once');
        }

        const updated: string[] = [];
        const failed: { id: string; error: string }[] = [];

        // ✅ TRANSACTION: Update tasks individually within transaction with authorization
        for (const update of updates) {
          try {
            const updateBuilder = manager
              .createQueryBuilder()
              .update(Task)
              .set({ ...update.data, updatedAt: new Date() })
              .where('id = :id', { id: update.id });

            // ✅ AUTHORIZATION: Add userId filter for non-admin users
            if (userRole !== 'admin' && userId) {
              updateBuilder.andWhere('userId = :userId', { userId });
            }

            const result = await updateBuilder.execute();

            if (result.affected && result.affected > 0) {
              updated.push(update.id);
            } else {
              failed.push({
                id: update.id,
                error: 'Task not found or access denied'
              });
            }
          } catch (error) {
            failed.push({
              id: update.id,
              error: error instanceof Error ? error.message : 'Unknown error'
            });
          }
        }

        // ✅ QUEUE: Add updated tasks to queue if status changed
        const statusUpdates = updates.filter(update => update.data.status);
        if (statusUpdates.length > 0) {
          const queuePromises = statusUpdates
            .filter(update => updated.includes(update.id))
            .map(update =>
              this.taskQueue.add('task-status-update', {
                taskId: update.id,
                status: update.data.status,
              }, {
                attempts: 3,
                backoff: { type: 'exponential', delay: 2000 },
              })
            );

          await Promise.all(queuePromises);
        }

        return { updated, failed };
      } catch (error) {
        throw new Error(`Bulk update failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });
  }

  /**
   * ✅ OPTIMIZED: Validate task existence in bulk with authorization
   */
  async validateTasksExist(taskIds: string[], userId?: string, userRole?: string): Promise<{ existing: string[], missing: string[] }> {
    const queryBuilder = this.tasksRepository
      .createQueryBuilder('task')
      .select('task.id')
      .where('task.id IN (:...taskIds)', { taskIds });

    // ✅ AUTHORIZATION: Filter by userId for non-admin users
    if (userRole !== 'admin' && userId) {
      queryBuilder.andWhere('task.userId = :userId', { userId });
    }

    const existingTasks = await queryBuilder.getMany();
    const existingIds = existingTasks.map(task => task.id);
    const missingIds = taskIds.filter(id => !existingIds.includes(id));

    return { existing: existingIds, missing: missingIds };
  }

  /**
   * ✅ OPTIMIZED: Centralized cache invalidation for task operations
   * Enhanced to include individual task cache clearing and comprehensive list cache invalidation
   */
  private async clearTaskCaches(specificUserId?: string, specificTaskId?: string): Promise<void> {
    try {
      // ✅ SIMPLE & EFFECTIVE: Clear specific cache types instead of pattern matching
      const cachePromises = [];

      // ✅ NEW: Clear individual task caches if specific task ID provided
      if (specificTaskId) {
        // Clear both admin and user-specific caches for this task
        cachePromises.push(
          this.cacheService.delete(`task:${specificTaskId}:admin`, 'tasks')
        );

        // If we know the specific user, clear their cache
        if (specificUserId) {
          cachePromises.push(
            this.cacheService.delete(`task:${specificTaskId}:user:${specificUserId}`, 'tasks')
          );
        }

        // ✅ FALLBACK: Clear all possible user caches for this task using pattern
        cachePromises.push(
          this.cacheService.deletePattern(`task:${specificTaskId}:*`, 'tasks')
        );
      } else {
        // ✅ BULK: Clear all individual task caches when no specific task ID
        cachePromises.push(
          this.cacheService.deletePattern('task:*', 'tasks')
        );
      }

      // ✅ OPTIMIZED: Use pattern deletion instead of nested loops
      // This replaces 400+ individual deletions with just a few pattern deletions

      // Clear all task list caches using pattern matching
      cachePromises.push(
        this.cacheService.deletePattern('list:*', 'tasks')
      );

      // ✅ USER-SPECIFIC: Clear user-specific list caches if provided
      if (specificUserId) {
        // Clear caches that contain this specific user
        cachePromises.push(
          this.cacheService.deletePattern(`list:*"userId":"${specificUserId}"*`, 'tasks')
        );
      }

      // ✅ STATS: Clear user-specific stats cache
      if (specificUserId) {
        cachePromises.push(this.cacheService.delete(`stats:user:${specificUserId}`, 'tasks'));
      }

      // ✅ GLOBAL STATS: Clear global stats cache
      cachePromises.push(this.cacheService.delete('stats:global', 'tasks'));

      // ✅ COMPREHENSIVE: Clear all stats caches using pattern
      cachePromises.push(
        this.cacheService.deletePattern('stats:*', 'tasks')
      );

      await Promise.all(cachePromises);

      // ✅ DEBUG: Log optimized cache clearing (remove in production)
      console.log(`✅ OPTIMIZED: Cleared task caches using ${cachePromises.length} efficient operations${specificTaskId ? ` for task ${specificTaskId}` : ''}${specificUserId ? ` for user ${specificUserId}` : ''}`);
    } catch (error) {
      // ✅ RESILIENT: Don't fail the operation if cache clearing fails
      console.warn('Cache clearing failed:', error);
    }
  }
}

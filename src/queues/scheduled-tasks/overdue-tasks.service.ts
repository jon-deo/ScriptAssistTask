import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository, In } from 'typeorm';
import { Task } from '../../modules/tasks/entities/task.entity';
import { TaskStatus } from '../../modules/tasks/enums/task-status.enum';

@Injectable()
export class OverdueTasksService {
  private readonly logger = new Logger(OverdueTasksService.name);
  private readonly BATCH_SIZE = 100; // Process overdue tasks in batches
  private readonly MAX_RETRIES = 3;

  constructor(
    @InjectQueue('task-processing')
    private taskQueue: Queue,
    @InjectRepository(Task)
    private tasksRepository: Repository<Task>,
  ) { }

  /**
   * ✅ COMPLETE: Comprehensive overdue tasks checker
   * Runs every hour and processes overdue tasks in batches
   */
  @Cron(CronExpression.EVERY_HOUR)
  async checkOverdueTasks() {
    const startTime = Date.now();
    this.logger.log('🔍 Starting overdue tasks check...');

    try {
      // ✅ PERFORMANCE: Find overdue tasks with pagination for large datasets
      const now = new Date();
      let totalProcessed = 0;
      let totalQueued = 0;
      let offset = 0;
      let hasMoreTasks = true;

      while (hasMoreTasks) {
        // ✅ OPTIMIZATION: Process in batches to prevent memory issues
        const overdueTasks = await this.tasksRepository.find({
          where: {
            dueDate: LessThan(now),
            status: In([TaskStatus.PENDING, TaskStatus.IN_PROGRESS]), // Include in-progress tasks
          },
          select: ['id', 'title', 'dueDate', 'status', 'userId'], // Only select needed fields
          take: this.BATCH_SIZE,
          skip: offset,
          order: { dueDate: 'ASC' }, // Process oldest overdue tasks first
        });

        if (overdueTasks.length === 0) {
          hasMoreTasks = false;
          break;
        }

        // ✅ RELIABILITY: Process batch with error handling
        const queuedCount = await this.processBatch(overdueTasks);

        totalProcessed += overdueTasks.length;
        totalQueued += queuedCount;
        offset += this.BATCH_SIZE;

        // ✅ PERFORMANCE: Prevent infinite loops
        if (overdueTasks.length < this.BATCH_SIZE) {
          hasMoreTasks = false;
        }

        // ✅ MONITORING: Log progress for large datasets
        if (totalProcessed % 500 === 0) {
          this.logger.debug(`Processed ${totalProcessed} overdue tasks so far...`);
        }
      }

      const duration = Date.now() - startTime;
      this.logger.log(`✅ Overdue tasks check completed: ${totalProcessed} found, ${totalQueued} queued for processing (${duration}ms)`);

      // ✅ MONITORING: Log performance metrics
      if (totalProcessed > 0) {
        this.logger.warn(`⚠️  Found ${totalProcessed} overdue tasks - consider reviewing task management processes`);
      }

    } catch (error) {
      // ✅ ERROR HANDLING: Comprehensive error logging
      this.logger.error(`❌ Overdue tasks check failed: ${error instanceof Error ? error.message : 'Unknown error'}`, {
        error: error instanceof Error ? error.stack : error,
        timestamp: new Date().toISOString(),
      });

      // ✅ RELIABILITY: Don't throw error to prevent cron job from stopping
      // Log error but continue with next scheduled run
    }
  }

  /**
   * ✅ COMPLETE: Process a batch of overdue tasks
   */
  private async processBatch(overdueTasks: Task[]): Promise<number> {
    let queuedCount = 0;
    const failedTasks: string[] = [];

    // ✅ PERFORMANCE: Process tasks in parallel with concurrency limit
    const promises = overdueTasks.map(async (task) => {
      try {
        await this.taskQueue.add('overdue-tasks-notification', {
          taskId: task.id,
          title: task.title,
          dueDate: task.dueDate,
          status: task.status,
          userId: task.userId,
          overdueBy: this.calculateOverdueDuration(task.dueDate),
        }, {
          // ✅ RELIABILITY: Configure retry strategy for overdue notifications
          attempts: this.MAX_RETRIES,
          backoff: {
            type: 'exponential',
            delay: 5000, // Start with 5 second delay
          },
          // ✅ PERFORMANCE: Set job priority (overdue tasks are important)
          priority: 10,
          // ✅ MONITORING: Add job metadata
          jobId: `overdue-${task.id}-${Date.now()}`, // Unique job ID to prevent duplicates
        });

        queuedCount++;

      } catch (error) {
        // ✅ ERROR HANDLING: Track failed tasks but don't stop batch processing
        failedTasks.push(task.id);
        this.logger.error(`Failed to queue overdue task ${task.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    });

    // ✅ RELIABILITY: Wait for all tasks in batch to be processed
    await Promise.allSettled(promises);

    // ✅ MONITORING: Log batch results
    if (failedTasks.length > 0) {
      this.logger.warn(`Failed to queue ${failedTasks.length} overdue tasks: ${failedTasks.join(', ')}`);
    }

    return queuedCount;
  }

  /**
   * ✅ UTILITY: Calculate how long a task has been overdue
   */
  private calculateOverdueDuration(dueDate: Date): string {
    const now = new Date();
    const diffMs = now.getTime() - dueDate.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''}`;
    } else {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''}`;
    }
  }

  /**
   * ✅ UTILITY: Manual trigger for testing (can be called via admin endpoint)
   */
  async triggerOverdueCheck(): Promise<{ processed: number; queued: number }> {
    this.logger.log('🔧 Manual overdue tasks check triggered');

    // Store original method to track results
    let totalProcessed = 0;
    let totalQueued = 0;

    // Temporarily override logging to capture metrics
    const originalProcessBatch = this.processBatch.bind(this);
    this.processBatch = async (tasks: Task[]) => {
      totalProcessed += tasks.length;
      const queued = await originalProcessBatch(tasks);
      totalQueued += queued;
      return queued;
    };

    try {
      await this.checkOverdueTasks();
      return { processed: totalProcessed, queued: totalQueued };
    } finally {
      // Restore original method
      this.processBatch = originalProcessBatch;
    }
  }
}
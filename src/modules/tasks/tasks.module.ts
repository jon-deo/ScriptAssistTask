import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { Task } from './entities/task.entity';
import { CommonModule } from '../../common/common.module';
import { TaskProcessorModule } from '../../queues/task-processor/task-processor.module';
import { ScheduledTasksModule } from '../../queues/scheduled-tasks/scheduled-tasks.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Task]),
    BullModule.registerQueue({
      name: 'task-processing',
    }),
    CommonModule, // Import to access RateLimitingService
    TaskProcessorModule, // Import to access TaskProcessorService
    ScheduledTasksModule, // Import to access OverdueTasksService
  ],
  controllers: [TasksController],
  providers: [TasksService],
  exports: [TasksService, TypeOrmModule],
})
export class TasksModule { }
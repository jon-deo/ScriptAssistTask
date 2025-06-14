import { IsDate, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { TaskStatus } from '../enums/task-status.enum';
import { TaskPriority } from '../enums/task-priority.enum';
import { IsSafeText } from '../../../common/decorators/validation.decorators';

export class UpdateTaskDto {
  @ApiProperty({
    example: 'Complete project documentation',
    description: 'Task title (3-200 characters, no HTML/scripts)'
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(200)
  @IsSafeText()
  title: string; // Required

  @ApiProperty({
    example: 'Add details about API endpoints and data models',
    required: false,
    description: 'Task description (max 2000 characters, no HTML/scripts)'
  })
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  @IsSafeText()
  description?: string; // Optional

  @ApiProperty({ enum: TaskStatus, example: TaskStatus.PENDING, required: false })
  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus; // Optional

  @ApiProperty({ enum: TaskPriority, example: TaskPriority.MEDIUM, required: false })
  @IsEnum(TaskPriority)
  @IsOptional()
  priority?: TaskPriority; // Optional

  @ApiProperty({ example: '2023-12-31T23:59:59Z', required: false })
  @IsDate()
  @IsOptional()
  @Transform(({ value }) => value ? new Date(value) : undefined)
  dueDate?: Date; // Optional

  @ApiProperty({ example: '123e4567-e89b-12d3-a456-426614174000' })
  @IsUUID()
  @IsNotEmpty()
  userId: string; // Required
}
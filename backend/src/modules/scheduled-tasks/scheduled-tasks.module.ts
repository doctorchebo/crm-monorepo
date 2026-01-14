/**
 * Scheduled Tasks Module
 *
 * Centralized module for all scheduled/cron jobs in the application.
 * Uses NestJS Schedule module for cron-based task execution.
 *
 * Architecture:
 * - ScheduleModule.forRoot() enables the scheduler globally
 * - Individual task services contain @Cron decorated methods
 * - Tasks are organized by domain (staging cleanup, etc.)
 *
 * Adding new scheduled tasks:
 * 1. Create a new service in this module
 * 2. Add @Cron decorator to the method
 * 3. Import required dependencies
 * 4. Add to providers array
 */

import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { WhatsAppModule } from '../whatsapp/whatsapp.module';
import { StagingCleanupTask } from './tasks/staging-cleanup.task';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    WhatsAppModule, // For MediaStagingService access
  ],
  providers: [StagingCleanupTask],
  exports: [],
})
export class ScheduledTasksModule {}

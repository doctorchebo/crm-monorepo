import { getBullMQConnection } from '@config/redis.config';
import { db } from '@database/db.connection';
import { BullModule } from '@nestjs/bullmq';
import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { PermissionService } from '../../shared/services/permission.service';
import { AiMemoryModule } from '../ai-memory/ai-memory.module';
import { ContactsModule } from '../contacts/contacts.module';
import { TeamModule } from '../team/team.module';

// Controllers
import { AvailabilityController } from './controllers/availability.controller';
import { BookingController } from './controllers/booking.controller';
import { CalendarSyncController } from './controllers/calendar-sync.controller';
import { CalendarController } from './controllers/calendar.controller';
import { EventsController } from './controllers/events.controller';
import { PublicBookingController } from './controllers/public-booking.controller';

// Services
import {
  AvailabilityService,
  BookingLinksService,
  BookingsService,
  CalendarAiService,
  CalendarCrudService,
  CalendarService,
  CalendarShareService,
  CalendarSyncService,
  EventAttendeesService,
  EventRemindersService,
  EventsService,
} from './services';

// AI Tools
import {
  CalendarAiIntegrationService,
  CalendarAiToolsService,
  CalendarIntentDetectorService,
  CalendarToolExecutorService,
} from './ai';

// Queue Services and Workers
import {
  CALENDAR_REMINDER_QUEUE_NAME,
  CALENDAR_SYNC_QUEUE_NAME,
  CalendarReminderQueueService,
  CalendarReminderWorkerProcessor,
  CalendarSyncQueueService,
  CalendarSyncWorkerProcessor,
} from './queue';

// Scheduled Tasks
import { CalendarReminderTask, CalendarSyncTask } from './tasks';

@Module({
  imports: [
    ConfigModule,
    TeamModule,
    forwardRef(() => ContactsModule),
    AiMemoryModule,
    ScheduleModule.forRoot(),
    // BullMQ configuration
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: () => ({
        connection: getBullMQConnection(),
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: false,
        },
      }),
      inject: [ConfigService],
    }),
    // Register calendar queues
    BullModule.registerQueue(
      { name: CALENDAR_SYNC_QUEUE_NAME },
      { name: CALENDAR_REMINDER_QUEUE_NAME },
    ),
  ],
  controllers: [
    CalendarController,
    EventsController,
    BookingController,
    AvailabilityController,
    CalendarSyncController,
    PublicBookingController,
  ],
  providers: [
    // Database connection provider
    {
      provide: 'DATABASE_CONNECTION',
      useValue: db,
    },

    // Core services
    CalendarCrudService,
    CalendarShareService,

    // Event services
    EventsService,
    EventAttendeesService,
    EventRemindersService,

    // Booking services
    BookingLinksService,
    BookingsService,
    AvailabilityService,

    // Sync and AI services
    CalendarSyncService,
    CalendarAiService,

    // AI Tools
    CalendarAiToolsService,
    CalendarIntentDetectorService,
    CalendarToolExecutorService,
    CalendarAiIntegrationService,

    // Queue services
    CalendarSyncQueueService,
    CalendarReminderQueueService,

    // Queue workers
    CalendarSyncWorkerProcessor,
    CalendarReminderWorkerProcessor,

    // Scheduled tasks
    CalendarSyncTask,
    CalendarReminderTask,

    // Shared services
    PermissionService,

    // Main facade service
    CalendarService,
  ],
  exports: [
    CalendarService,
    CalendarCrudService,
    EventsService,
    BookingLinksService,
    BookingsService,
    AvailabilityService,
    CalendarSyncService,
    CalendarAiService,
    // AI Tools
    CalendarAiToolsService,
    CalendarIntentDetectorService,
    CalendarToolExecutorService,
    CalendarAiIntegrationService,
    // Queue services
    CalendarSyncQueueService,
    CalendarReminderQueueService,
    // Tasks
    CalendarReminderTask,
  ],
})
export class CalendarModule {}

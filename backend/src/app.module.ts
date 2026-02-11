import { AuditModule } from '@modules/audit/audit.module';
import { CatalogModule } from '@modules/catalog/catalog.module';
import { KnowledgeBaseModule } from '@modules/knowledge-base/knowledge-base.module';
import { LabelsModule } from '@modules/labels/labels.module';
import { MediaCompressionModule } from '@modules/media-compression/media-compression.module';
import { NotesModule } from '@modules/notes/notes.module';
import { PinsModule } from '@modules/pins/pins.module';
import { ProfilePictureModule } from '@modules/profile-picture/profile-picture.module';
import { ReactionsModule } from '@modules/reactions/reactions.module';
import { ScheduledTasksModule } from '@modules/scheduled-tasks/scheduled-tasks.module';
import { WorkflowModule } from '@modules/workflow/workflow.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { aiMemoryConfig } from './config/ai-memory.config';
import { DatabaseModule } from './database/drizzle.module';
import { AiMemoryModule } from './modules/ai-memory/ai-memory.module';
import { AIReplyModule } from './modules/ai-reply/ai-reply.module';
import { AuthModule } from './modules/auth/auth.module';
import { AutomationModule } from './modules/automation/automation.module';
import { BillingModule } from './modules/billing/billing.module';
import { ChatsModule } from './modules/chats/chats.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { ImportJobsModule } from './modules/import-jobs/import-jobs.module';
import { KanbanModule } from './modules/kanban/kanban.module';
import { LinkPreviewModule } from './modules/link-preview/link-preview.module';
import { MessagingModule } from './modules/messaging/messaging.module';
import { SendersModule } from './modules/senders/senders.module';
import { SettingsModule } from './modules/settings/settings.module';
import { TeamModule } from './modules/team/team.module';
import { TemplatesModule } from './modules/templates/templates.module';
import { ThumbnailModule } from './modules/thumbnail/thumbnail.module';
import { UserModule } from './modules/user/user.module';
import { WhatsAppModule } from './modules/whatsapp/whatsapp.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      load: [aiMemoryConfig],
    }),
    AuthModule,
    UserModule,
    TeamModule,
    ContactsModule,
    SendersModule,
    TemplatesModule,
    WhatsAppModule,
    MessagingModule,
    NotesModule,
    ReactionsModule,
    PinsModule,
    ChatsModule,
    AutomationModule,
    KanbanModule,
    LabelsModule,
    SettingsModule,
    BillingModule,
    ThumbnailModule,
    LinkPreviewModule,
    AiMemoryModule,
    AIReplyModule,
    KnowledgeBaseModule,
    WorkflowModule,
    MediaCompressionModule,
    ScheduledTasksModule,
    ImportJobsModule,
    ProfilePictureModule,
    CatalogModule,
    AuditModule,
    DatabaseModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

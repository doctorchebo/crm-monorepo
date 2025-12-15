import { NotesModule } from '@modules/notes/notes.module';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { DatabaseModule } from './database/drizzle.module';
import { AuthModule } from './modules/auth/auth.module';
import { AutomationModule } from './modules/automation/automation.module';
import { BillingModule } from './modules/billing/billing.module';
import { ChatsModule } from './modules/chats/chats.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { KanbanModule } from './modules/kanban/kanban.module';
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
    ChatsModule,
    AutomationModule,
    KanbanModule,
    SettingsModule,
    BillingModule,
    ThumbnailModule,
    DatabaseModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}

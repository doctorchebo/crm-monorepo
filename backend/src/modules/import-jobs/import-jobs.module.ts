import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ImportJobsController } from './import-jobs.controller';
import { ImportJobsService } from './import-jobs.service';

@Module({
    imports: [ConfigModule],
    controllers: [ImportJobsController],
    providers: [ImportJobsService],
    exports: [ImportJobsService],
})
export class ImportJobsModule { }

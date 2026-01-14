import {
    Body,
    Controller,
    Delete,
    Get,
    Logger,
    Param,
    Post,
    Query,
    Req,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { ImportJobsService } from './import-jobs.service';
import {
    CreateImportJobDto,
    SaveFieldMappingDto,
    TriggerValidationDto,
    CommitImportDto,
    StagingPreviewQueryDto,
    CreateMappingProfileDto,
} from './dto';

@Controller('import-jobs')
@UseGuards(JwtAuthGuard)
export class ImportJobsController {
    private readonly logger = new Logger(ImportJobsController.name);

    constructor(private readonly importJobsService: ImportJobsService) { }

    /**
     * Create a new import job and get presigned upload URL
     * POST /import-jobs
     */
    @Post()
    async createJob(@Body() dto: CreateImportJobDto, @Req() req: any) {
        const userId = req.user?.userId;
        this.logger.log(`Creating import job for user ${userId}`);
        return this.importJobsService.createJob(userId, dto.originalFilename);
    }

    /**
     * Notify that file upload is complete
     * POST /import-jobs/:id/upload-complete
     */
    @Post(':id/upload-complete')
    async notifyUploadComplete(@Param('id') jobId: string, @Req() req: any) {
        const userId = req.user?.userId;
        await this.importJobsService.notifyUploadComplete(jobId, userId);
        return { success: true };
    }

    /**
     * Get all import jobs for current user
     * GET /import-jobs
     */
    @Get()
    async getJobs(@Req() req: any) {
        const userId = req.user?.userId;
        return this.importJobsService.getJobs(userId);
    }

    /**
     * Get a single import job
     * GET /import-jobs/:id
     */
    @Get(':id')
    async getJob(@Param('id') jobId: string, @Req() req: any) {
        const userId = req.user?.userId;
        return this.importJobsService.getJob(jobId, userId);
    }

    /**
     * Save field mapping configuration
     * POST /import-jobs/:id/mapping
     */
    @Post(':id/mapping')
    async saveMapping(
        @Param('id') jobId: string,
        @Body() dto: SaveFieldMappingDto,
        @Req() req: any,
    ) {
        const userId = req.user?.userId;
        return this.importJobsService.saveFieldMapping(
            jobId,
            userId,
            dto.mapping,
            dto.fullNameColumn,
            dto.defaultCountryCode,
        );
    }

    /**
     * Trigger validation
     * POST /import-jobs/:id/validate
     */
    @Post(':id/validate')
    async triggerValidation(
        @Param('id') jobId: string,
        @Body() dto: TriggerValidationDto,
        @Req() req: any,
    ) {
        const userId = req.user?.userId;
        await this.importJobsService.triggerValidation(
            jobId,
            userId,
            dto.batchSize,
        );
        return { success: true };
    }

    /**
     * Get staging rows preview
     * GET /import-jobs/:id/preview
     */
    @Get(':id/preview')
    async getPreview(
        @Param('id') jobId: string,
        @Query() query: StagingPreviewQueryDto,
        @Req() req: any,
    ) {
        const userId = req.user?.userId;
        return this.importJobsService.getStagingPreview(
            jobId,
            userId,
            query.skip,
            query.take,
            query.status,
        );
    }

    /**
     * Commit the import
     * POST /import-jobs/:id/commit
     */
    @Post(':id/commit')
    async commitImport(
        @Param('id') jobId: string,
        @Body() dto: CommitImportDto,
        @Req() req: any,
    ) {
        const userId = req.user?.userId;
        await this.importJobsService.commitImport(jobId, userId, dto.batchSize);
        return { success: true };
    }

    /**
     * Rollback an import
     * DELETE /import-jobs/:id/rollback
     */
    @Delete(':id/rollback')
    async rollbackImport(@Param('id') jobId: string, @Req() req: any) {
        const userId = req.user?.userId;
        return this.importJobsService.rollbackImport(jobId, userId);
    }

    /**
     * Delete an import job
     * DELETE /import-jobs/:id
     */
    @Delete(':id')
    async deleteJob(@Param('id') jobId: string, @Req() req: any) {
        const userId = req.user?.userId;
        await this.importJobsService.deleteJob(jobId, userId);
        return { success: true };
    }

    // ==================== Mapping Profiles ====================

    /**
     * Get all mapping profiles
     * GET /import-jobs/profiles
     */
    @Get('profiles')
    async getProfiles(@Req() req: any) {
        const userId = req.user?.userId;
        return this.importJobsService.getMappingProfiles(userId);
    }

    /**
     * Create a mapping profile
     * POST /import-jobs/profiles
     */
    @Post('profiles')
    async createProfile(@Body() dto: CreateMappingProfileDto, @Req() req: any) {
        const userId = req.user?.userId;
        return this.importJobsService.createMappingProfile(
            userId,
            dto.providerName,
            dto.mapping,
        );
    }

    /**
     * Delete a mapping profile
     * DELETE /import-jobs/profiles/:id
     */
    @Delete('profiles/:id')
    async deleteProfile(@Param('id') profileId: string, @Req() req: any) {
        const userId = req.user?.userId;
        await this.importJobsService.deleteMappingProfile(profileId, userId);
        return { success: true };
    }
}

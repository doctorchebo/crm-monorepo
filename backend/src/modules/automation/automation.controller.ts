import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { AutomationService } from './automation.service';
import { CreateRuleDto } from './dto/create-rule.dto';
import { UpdateRuleDto } from './dto/update-rule.dto';

@Controller('automation/rules')
@UseGuards(JwtAuthGuard)
export class AutomationController {
  constructor(private automationService: AutomationService) {}

  @Post()
  async create(@Body() createRuleDto: CreateRuleDto) {
    // TODO: Get teamId from request context
    return this.automationService.createRule('teamId', createRuleDto);
  }

  @Get()
  async findByTeam() {
    // TODO: Get teamId from request context
    return this.automationService.findByTeam('teamId');
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.automationService.findOne(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() updateRuleDto: UpdateRuleDto) {
    return this.automationService.update(id, updateRuleDto);
  }

  @Delete(':id')
  async delete(@Param('id') id: string) {
    return this.automationService.delete(id);
  }

  @Post('evaluate')
  async evaluateTriggers(@Body() data: any) {
    return this.automationService.evaluateTriggers(
      data.message,
      data.emotion,
      data.context,
    );
  }
}

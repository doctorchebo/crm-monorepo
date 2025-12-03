import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { OutboundMessageDto } from './dto/outbound-message.dto';
import { WhatsAppService } from './whatsapp.service';

@Controller('whatsapp')
export class WhatsAppController {
  constructor(private whatsAppService: WhatsAppService) {}

  @Post('send')
  @UseGuards(JwtAuthGuard)
  async sendMessage(@Body() messageDto: OutboundMessageDto) {
    return this.whatsAppService.sendMessage(messageDto);
  }

  @Post('status/:messageSid')
  @UseGuards(JwtAuthGuard)
  async getMessageStatus(@Body() data: any) {
    return this.whatsAppService.getMessageStatus(data.messageSid);
  }
}

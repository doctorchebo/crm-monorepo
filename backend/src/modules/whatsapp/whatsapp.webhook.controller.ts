import { Body, Controller, Post } from '@nestjs/common';
import { WebhookDto } from './dto/webhook.dto';
import { WhatsAppService } from './whatsapp.service';

@Controller('webhook/whatsapp')
export class WhatsAppWebhookController {
  constructor(private whatsAppService: WhatsAppService) {}

  @Post('inbound')
  async handleInbound(@Body() webhookDto: WebhookDto) {
    // Twilio sends Form data, not JSON by default
    return this.whatsAppService.handleInboundMessage(webhookDto);
  }

  @Post('status')
  async handleStatus(@Body() webhookDto: WebhookDto) {
    return this.whatsAppService.handleMessageStatus(
      webhookDto.MessageSid,
      webhookDto.MessageStatus,
    );
  }
}

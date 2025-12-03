import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { BillingService } from './billing.service';

@Controller('webhook/stripe')
export class StripeWebhookController {
  constructor(private billingService: BillingService) {}

  @Post()
  async handleStripeWebhook(@Req() request: Request, @Body() event: any) {
    // TODO: Verify Stripe webhook signature using request.rawBody
    // TODO: Process event and call billingService.handleWebhookEvent()
    return { received: true };
  }
}

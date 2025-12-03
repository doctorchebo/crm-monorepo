import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { BillingService } from './billing.service';

@Controller('webhook/stripe')
export class StripeWebhookController {
  constructor(private billingService: BillingService) {}

  @Post()
  async handleStripeWebhook(@Req() request: Request, @Body() event: any) {
    try {
      const payload = await this.getRawBody(request);
      const signature = request.headers['stripe-signature'] as string;

      if (!signature) {
        return { error: 'Missing Stripe signature' };
      }

      const stripeEvent = await this.billingService.constructWebhookEvent(
        payload,
        signature,
      );

      await this.billingService.handleWebhookEvent(stripeEvent);

      return { received: true };
    } catch (error) {
      console.error('Webhook error:', error);
      return { error: 'Webhook processing failed' };
    }
  }

  private async getRawBody(request: Request): Promise<string> {
    return new Promise((resolve) => {
      let data = '';
      request.on('data', (chunk) => {
        data += chunk;
      });
      request.on('end', () => {
        resolve(data);
      });
    });
  }
}

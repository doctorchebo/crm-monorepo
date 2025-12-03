import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/auth.guard';
import { BillingService } from './billing.service';

@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private billingService: BillingService) {}

  @Get('subscription')
  async getSubscription() {
    // TODO: Get teamId from request context
    return this.billingService.getSubscription('teamId');
  }

  @Post('checkout')
  async createCheckout(@Body() data: { priceId: string }) {
    // TODO: Get teamId from request context
    return this.billingService.createCheckoutSession('teamId', data.priceId);
  }

  @Post('portal')
  async createPortalSession() {
    // TODO: Get teamId from request context
    return this.billingService.createCustomerPortalSession('teamId');
  }

  @Get('invoices')
  async getInvoices() {
    // TODO: Get teamId from request context
    return this.billingService.getInvoices('teamId');
  }
}

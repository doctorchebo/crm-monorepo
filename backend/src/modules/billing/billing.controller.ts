import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/auth.guard';
import { BillingService } from './billing.service';

@Controller('billing')
@UseGuards(JwtAuthGuard)
export class BillingController {
  constructor(private billingService: BillingService) {}

  @Get('subscription')
  async getSubscription(@Req() req: Request & { user: any }) {
    // TODO: Get teamId and customerId from request/database
    const customerId = 'cus_xxxxx'; // Get from team data
    return this.billingService.getSubscription('teamId', customerId);
  }

  @Post('checkout')
  async createCheckout(
    @Body() data: { priceId: string },
    @Req() req: Request & { user: any },
  ) {
    // TODO: Get teamId and userId from request context
    const userId = req.user?.userId;
    const customerId = 'cus_xxxxx'; // Get from team data if exists
    return this.billingService.createCheckoutSession(
      'teamId',
      userId,
      data.priceId,
      customerId,
    );
  }

  @Post('portal')
  async createPortalSession(
    @Body() data: { returnUrl: string },
    @Req() req: Request & { user: any },
  ) {
    // TODO: Get customerId from request/database
    const customerId = 'cus_xxxxx'; // Get from team data
    return this.billingService.createCustomerPortalSession(
      customerId,
      data.returnUrl,
    );
  }

  @Get('invoices')
  async getInvoices(@Req() req: Request & { user: any }) {
    // TODO: Get customerId from request/database
    const customerId = 'cus_xxxxx'; // Get from team data
    return this.billingService.getInvoices(customerId);
  }

  @Get('checkout/:sessionId')
  async getCheckoutSession(@Body() data: { sessionId: string }) {
    return this.billingService.retrieveCheckoutSession(data.sessionId);
  }
}

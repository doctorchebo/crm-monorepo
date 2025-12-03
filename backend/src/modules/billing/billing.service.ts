import { Injectable } from '@nestjs/common';
import Stripe from 'stripe';

@Injectable()
export class BillingService {
  private stripe: Stripe;

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2023-10-16',
    });
  }

  async getSubscription(teamId: string, customerId: string) {
    // TODO: Fetch subscription details from Stripe using customerId
    try {
      const subscriptions = await this.stripe.subscriptions.list({
        customer: customerId,
        limit: 1,
      });
      return subscriptions.data[0] || null;
    } catch (error) {
      console.error('Error fetching subscription:', error);
      return null;
    }
  }

  async createCheckoutSession(
    teamId: string,
    userId: string,
    priceId: string,
    customerId?: string,
  ) {
    // TODO: Create Stripe checkout session
    try {
      const session = await this.stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        mode: 'subscription',
        success_url: `${process.env.FRONTEND_URL}/stripe/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.FRONTEND_URL}/pricing`,
        client_reference_id: userId,
        customer: customerId,
        customer_creation: customerId ? undefined : 'always',
      });
      return session;
    } catch (error) {
      console.error('Error creating checkout session:', error);
      throw error;
    }
  }

  async createCustomerPortalSession(customerId: string, returnUrl: string) {
    // TODO: Create Stripe customer portal session for subscription management
    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl,
      });
      return session;
    } catch (error) {
      console.error('Error creating customer portal session:', error);
      throw error;
    }
  }

  async handleWebhookEvent(event: Stripe.Event) {
    // TODO: Process Stripe webhook events
    // - subscription.updated
    // - invoice.payment_succeeded
    // - invoice.payment_failed
    // - customer.subscription.deleted
    switch (event.type) {
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        const subscription = event.data.object as Stripe.Subscription;
        await this.handleSubscriptionChange(subscription);
        break;
      default:
        console.log(`Unhandled event type ${event.type}`);
    }
  }

  private async handleSubscriptionChange(subscription: Stripe.Subscription) {
    // TODO: Update team subscription status in database
    // This would typically involve:
    // 1. Finding the team by stripe subscription ID
    // 2. Updating subscription status, plan, etc
    console.log(
      'Subscription changed for customer:',
      subscription.customer,
      'Status:',
      subscription.status,
    );
  }

  async getInvoices(customerId: string) {
    // TODO: Fetch invoices from Stripe
    try {
      const invoices = await this.stripe.invoices.list({
        customer: customerId,
        limit: 10,
      });
      return invoices.data;
    } catch (error) {
      console.error('Error fetching invoices:', error);
      return [];
    }
  }

  async retrieveCheckoutSession(sessionId: string) {
    // TODO: Retrieve checkout session details
    try {
      const session = await this.stripe.checkout.sessions.retrieve(sessionId, {
        expand: ['customer', 'subscription'],
      });
      return session;
    } catch (error) {
      console.error('Error retrieving checkout session:', error);
      throw error;
    }
  }

  async constructWebhookEvent(
    payload: string,
    signature: string,
  ): Promise<Stripe.Event> {
    try {
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        process.env.STRIPE_WEBHOOK_SECRET || '',
      );
      return event;
    } catch (error) {
      console.error('Webhook signature verification failed:', error);
      throw error;
    }
  }
}

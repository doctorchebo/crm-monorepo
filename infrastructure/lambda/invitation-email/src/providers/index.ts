/**
 * Email Provider Factory
 *
 * Creates the appropriate email provider based on configuration.
 */

import { EmailProvider, getProviderType } from "./email-provider.interface";
import { MailgunProvider } from "./mailgun.provider";
import { SESProvider } from "./ses.provider";
import { MockEmailProvider } from "./mock.provider";

let cachedProvider: EmailProvider | null = null;

export function getEmailProvider(): EmailProvider {
  if (cachedProvider) {
    return cachedProvider;
  }

  const providerType = getProviderType();

  switch (providerType) {
    case "mailgun":
      cachedProvider = new MailgunProvider();
      break;
    case "ses":
      cachedProvider = new SESProvider();
      break;
    case "mock":
    default:
      cachedProvider = new MockEmailProvider();
      break;
  }

  console.log(`Email provider initialized: ${cachedProvider.name}`);
  return cachedProvider;
}

// Re-export for convenience
export { EmailProvider } from "./email-provider.interface";
export { MailgunProvider } from "./mailgun.provider";
export { SESProvider } from "./ses.provider";
export { MockEmailProvider } from "./mock.provider";

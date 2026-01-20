/**
 * Email Provider Factory
 */

import { MailgunProvider } from "./mailgun.provider";

export async function getEmailProvider(): Promise<MailgunProvider> {
  return new MailgunProvider();
}

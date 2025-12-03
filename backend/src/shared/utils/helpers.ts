/**
 * Utility Functions
 */

export function generateRandomString(length: number): string {
  const chars =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export function sanitizePhoneNumber(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

export function formatTimestamp(date: Date): string {
  return date.toISOString();
}

export function calculatePageSkip(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}

/**
 * Client-side cookie utilities
 * These functions work in the browser via document.cookie
 */

export function setCookie(
  name: string,
  value: string,
  expiresInSeconds: number = 3600
) {
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000);
  const cookieString = [
    `${encodeURIComponent(name)}=${encodeURIComponent(value)}`,
    `expires=${expiresAt.toUTCString()}`,
    `path=/`,
    `secure`,
    `samesite=lax`,
  ].join(";");

  document.cookie = cookieString;
}

export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;

  const cookies = document.cookie.split(";");
  for (const cookie of cookies) {
    const [key, value] = cookie.trim().split("=");
    if (key === name && value) {
      return decodeURIComponent(value);
    }
  }
  return null;
}

export function deleteCookie(name: string) {
  document.cookie = `${encodeURIComponent(
    name
  )}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
}

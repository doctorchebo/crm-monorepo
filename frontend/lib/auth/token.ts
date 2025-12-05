/**
 * JWT Token utilities for checking expiration and validity
 * Works on both client and server side
 */

/**
 * Base64 decode function that works in browser
 */
function base64UrlDecode(str: string): string {
  let output = str.replace(/-/g, "+").replace(/_/g, "/");
  switch (output.length % 4) {
    case 0:
      break;
    case 2:
      output += "==";
      break;
    case 3:
      output += "=";
      break;
    default:
      throw new Error("Illegal base64url string!");
  }

  try {
    return decodeURIComponent(
      atob(output)
        .split("")
        .map((c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
        .join("")
    );
  } catch (error) {
    return atob(output);
  }
}

/**
 * Decode JWT token and extract payload (does not verify signature)
 * This is safe for client-side use to check expiration
 */
export function decodeToken(token: string): Record<string, any> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) {
      return null;
    }

    // Decode payload (second part)
    const decoded = JSON.parse(base64UrlDecode(parts[1]));
    return decoded;
  } catch (error) {
    console.error("Error decoding token:", error);
    return null;
  }
}

/**
 * Check if token is expired
 */
export function isTokenExpired(token: string): boolean {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) {
    return true; // Treat invalid tokens as expired
  }

  // exp is in seconds, Date.now() is in milliseconds
  const currentTime = Math.floor(Date.now() / 1000);
  return decoded.exp < currentTime;
}

/**
 * Get the time remaining before token expires (in seconds)
 */
export function getTokenTimeRemaining(token: string): number | null {
  const decoded = decodeToken(token);
  if (!decoded || !decoded.exp) {
    return null;
  }

  const currentTime = Math.floor(Date.now() / 1000);
  const remaining = decoded.exp - currentTime;
  return remaining > 0 ? remaining : 0;
}

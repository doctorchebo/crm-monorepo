import { AuthHeader } from "@/components/auth-header";

/**
 * Layout for authentication pages (sign-in, sign-up).
 *
 * This layout provides:
 * - AuthHeader with theme toggle and language switcher
 * - Consistent wrapper for all auth-related pages
 *
 * The AuthHeader is positioned absolutely to overlay the auth page content,
 * allowing for a cleaner visual design while maintaining access to essential
 * controls (theme, language) that should persist across all pages.
 *
 * Theme and language preferences are persisted via:
 * - Theme: localStorage ('theme' key) - handled by ThemeProvider
 * - Language: NEXT_LOCALE cookie - handled by LanguageSwitcher and middleware
 */
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="relative min-h-[100dvh]">
      <AuthHeader />
      {children}
    </div>
  );
}

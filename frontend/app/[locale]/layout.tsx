import { AudioUnlockInitializer } from "@/components/audio-unlock-initializer";
import { NotificationContainer } from "@/components/notifications/notification-container";
import { NotificationProvider } from "@/hooks/use-notification";
import { defaultLocale, locales } from "@/i18n";
import { AuthProvider } from "@/lib/auth/auth-context";
import { ThemeProvider } from "@/lib/theme/theme-provider";
import { ThemeScript } from "@/lib/theme/theme-script";
import { routing } from "@/src/i18n/routing";
import type { Metadata, Viewport } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { setRequestLocale } from "next-intl/server";
import { Manrope } from "next/font/google";
import { notFound } from "next/navigation";
import { SWRConfig } from "swr";
import "./globals.css";

export const metadata: Metadata = {
  title: "Wappify CRM",
  description: "Wappify CRM - Manage your WhatsApp conversations",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  maximumScale: 1,
};

const manrope = Manrope({ subsets: ["latin"] });

type Props = {
  children: React.ReactNode;
  params: Promise<{
    locale: string;
  }>;
};

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function RootLayout({ children, params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  setRequestLocale(locale);

  return (
    <html
      lang={locale || defaultLocale}
      suppressHydrationWarning
      className={manrope.className}
    >
      <head>
        <ThemeScript />
      </head>
      <body className="min-h-[100dvh] bg-white dark:bg-gray-950 text-black dark:text-white">
        <AudioUnlockInitializer />
        <AuthProvider>
          <NotificationProvider>
            <NextIntlClientProvider locale={locale}>
              <ThemeProvider>
                <SWRConfig
                  value={{
                    // Global SWR configuration
                    // Don't use fallback data from server-side DB queries
                    // as they use a different auth context than the backend API
                    revalidateOnFocus: false,
                    shouldRetryOnError: false,
                    dedupingInterval: 2000,
                  }}
                >
                  {children}
                  <NotificationContainer />
                </SWRConfig>
              </ThemeProvider>
            </NextIntlClientProvider>
          </NotificationProvider>
        </AuthProvider>
      </body>
    </html>
  );
}

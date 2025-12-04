import { defaultLocale, locales } from "@/i18n";
import { getTeamForUser, getUser } from "@/lib/db/queries";
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
import { NotificationProvider } from "@/hooks/use-notification";
import { NotificationContainer } from "@/components/notifications/notification-container";

export const metadata: Metadata = {
  title: "Next.js SaaS Starter",
  description: "Get started quickly with Next.js, Postgres, and Stripe.",
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
        <NotificationProvider>
          <NextIntlClientProvider locale={locale}>
            <ThemeProvider>
              <SWRConfig
                value={{
                  fallback: {
                    // We do NOT await here
                    // Only components that read this data will suspend
                    "/api/user": getUser(),
                    "/api/team": getTeamForUser(),
                  },
                }}
              >
                {children}
                <NotificationContainer />
              </SWRConfig>
            </ThemeProvider>
          </NextIntlClientProvider>
        </NotificationProvider>
      </body>
    </html>
  );
}

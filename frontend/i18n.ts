import { getRequestConfig } from "next-intl/server";

export const locales = ["en", "es"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export default getRequestConfig(async ({ locale }) => {
  // Validate locale is supported
  if (!locales.includes(locale as any)) {
    console.warn(
      `Unsupported locale: ${locale}, falling back to ${defaultLocale}`
    );
    return {
      messages: (await import(`./messages/${defaultLocale}.json`)).default,
    };
  }

  return {
    messages: (await import(`./messages/${locale}.json`)).default,
  };
});

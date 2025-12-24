import { getRequestConfig } from "next-intl/server";

export const locales = ["en", "es"] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = "en";

export default getRequestConfig(async ({ locale }) => {
  // Validate locale is supported
  const validLocale = locales.includes(locale as any)
    ? (locale as string)
    : defaultLocale;

  if (validLocale !== locale) {
    console.warn(
      `Unsupported locale: ${locale}, falling back to ${defaultLocale}`
    );
  }

  return {
    locale: validLocale,
    messages: (await import(`./messages/${validLocale}.json`)).default,
  };
});

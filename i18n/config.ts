export type Locale = (typeof locales)[number];

export const locales = ["en", "fr", "es"] as const;
export const defaultLocale: Locale = "fr";

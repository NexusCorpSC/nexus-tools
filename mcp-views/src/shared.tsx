import type { App } from "@modelcontextprotocol/ext-apps";
import { createContext, useContext, type ReactNode } from "react";
import { createTranslator } from "use-intl/core";
import messages from "virtual:view-messages";

export type Locale = keyof typeof messages;

/** La langue de l'hôte, ramenée à celles du site (anglais par défaut). */
export function pickLocale(tag?: string): Locale {
  const base = (tag ?? navigator.language ?? "en").slice(0, 2).toLowerCase();
  return base in messages ? (base as Locale) : "en";
}

export type Translate = (
  key: string,
  values?: Record<string, unknown>,
) => string;

export function translator(locale: Locale): Translate {
  const t = createTranslator({
    locale,
    messages: messages[locale] as never,
    // Une clé absente rend son chemin, sans bruit dans la console de l'hôte.
    onError: () => {},
  });
  return (key, values) => {
    try {
      return (t as unknown as Translate)(key, values);
    } catch {
      return key;
    }
  };
}

export function plateLabels(locale: Locale) {
  return messages[locale].planPlate as {
    glyphs: Record<string, string>;
    credits: string;
  };
}

export type ViewContext = {
  app: App;
  locale: Locale;
  t: Translate;
  /** Les arguments de l'appel d'outil, quand l'hôte les envoie. */
  input?: Record<string, unknown>;
};

const Context = createContext<ViewContext | null>(null);

export function ViewProvider({
  value,
  children,
}: {
  value: ViewContext;
  children: ReactNode;
}) {
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useView(): ViewContext {
  const value = useContext(Context);
  if (!value) throw new Error("useView outside ViewProvider");
  return value;
}

/** Un lien vers le site, ouvert par l'hôte (l'iframe ne navigue pas). */
export function SiteLink({
  href,
  children,
  className,
}: {
  href?: string;
  children: ReactNode;
  className?: string;
}) {
  const { app } = useView();
  if (!href) return <>{children}</>;
  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        event.preventDefault();
        void app.openLink({ url: href });
      }}
    >
      {children}
    </a>
  );
}

export function OpenOnSite({ href }: { href?: string }) {
  const { t } = useView();
  if (!href) return null;
  return (
    <SiteLink href={href} className="open">
      {t("common.openOnSite")} ↗
    </SiteLink>
  );
}

/** Une adresse d'image utilisable : absolue, ou relative au site. */
export function imageSrc(src: unknown, base?: string): string | undefined {
  if (typeof src !== "string" || !src) return undefined;
  try {
    return new URL(src, base).href;
  } catch {
    return undefined;
  }
}

export function formatNumber(locale: Locale, value: number) {
  return value.toLocaleString(locale);
}

export function formatMoney(locale: Locale, value: number) {
  return `${value.toLocaleString(locale)} aUEC`;
}

export function formatDistance(locale: Locale, metres: number) {
  if (metres >= 1_000_000)
    return `${(metres / 1_000_000).toLocaleString(locale, { maximumFractionDigits: 1 })} Mm`;
  if (metres >= 1000)
    return `${(metres / 1000).toLocaleString(locale, { maximumFractionDigits: 1 })} km`;
  return `${Math.round(metres).toLocaleString(locale)} m`;
}

import type { App } from "@modelcontextprotocol/ext-apps";
import { useApp } from "@modelcontextprotocol/ext-apps/react";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { pickLocale, translator, ViewProvider } from "./shared";
import "./styles.css";
import { InventoryView } from "./views/inventory";
import { MarketplaceView } from "./views/marketplace";
import { NpsView } from "./views/nps";
import { PlanView } from "./views/plan";
import { SheetView } from "./views/sheet";

/**
 * Les vues MCP Apps de Nexus Tools. Le serveur pose le nom de la vue sur
 * `<html data-view>` (`lib/mcp/apps.ts`) ; la vue se dessine à partir du
 * `structuredContent` du résultat que l'hôte lui transmet.
 */

const VIEWS = {
  marketplace: MarketplaceView,
  sheet: SheetView,
  inventory: InventoryView,
  plan: PlanView,
  nps: NpsView,
} as const;

type Data = Record<string, unknown>;
type CallToolResult = Parameters<NonNullable<App["ontoolresult"]>>[0];

function Root() {
  const [input, setInput] = useState<Data>();
  const [result, setResult] = useState<CallToolResult>();
  const [hostLocale, setHostLocale] = useState<string>();
  const { app, error } = useApp({
    appInfo: { name: "Nexus Tools views", version: "1.0.0" },
    capabilities: {},
    onAppCreated: (created) => {
      created.ontoolinput = (params) => setInput(params.arguments as Data);
      created.ontoolresult = (params) => setResult(params);
      created.onhostcontextchanged = (context) => {
        if (context.locale) setHostLocale(context.locale);
      };
    },
  });

  // La langue annoncée à la connexion, puis celle des changements de contexte.
  const locale = pickLocale(hostLocale ?? app?.getHostContext()?.locale);
  const t = translator(locale);
  const name = document.documentElement.dataset.view as keyof typeof VIEWS;
  const View = VIEWS[name];

  if (error) return <p className="muted">{t("common.error")}</p>;
  if (!app || !View) return <p className="muted">{t("common.loading")}</p>;
  if (!result) return <p className="muted">{t("common.waiting")}</p>;
  if (result.isError || !result.structuredContent) {
    const text = result.content?.find(
      (part: { type: string }) => part.type === "text",
    );
    return (
      <p className="muted">
        {text && "text" in text ? text.text : t("common.error")}
      </p>
    );
  }
  return (
    <ViewProvider value={{ app, locale, t, input }}>
      <View data={result.structuredContent as Data} />
    </ViewProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);

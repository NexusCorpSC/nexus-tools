import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { listMcpTools, type McpToolEntry } from "@/lib/mcp/catalog";
import { MCP_SCOPES, mcpResource, OIDC_SCOPES } from "@/lib/mcp/oauth-config";
import { CopyButton } from "./copy-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("Developers");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    openGraph: {
      title: `${t("metaTitle")} — Nexus Tools`,
      description: t("metaDescription"),
      url: "https://tools.services.nexus/developers",
    },
  };
}

const CARD =
  "rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm space-y-3";

function Code({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg border border-[#9ED0FF]/15 bg-black/40 p-3 text-sm">
      <code>{children}</code>
    </pre>
  );
}

function ToolList({
  tools,
  labels,
}: {
  tools: McpToolEntry[];
  labels: { scope: (scope: string) => string; writes: string; view: string };
}) {
  return (
    <ul className="space-y-2">
      {tools.map((tool) => (
        <li key={tool.name}>
          <div className="flex flex-wrap items-center gap-2">
            <code className="font-semibold text-[#9ED0FF]">{tool.name}</code>
            <span className="text-sm">{tool.title}</span>
            {tool.writes && (
              <span className="rounded-full border border-amber-300/40 px-2 text-xs text-amber-200">
                {labels.writes}
              </span>
            )}
            {tool.view && (
              <span className="rounded-full border border-[#9ED0FF]/40 px-2 text-xs text-[#9ED0FF]">
                {labels.view}
              </span>
            )}
            {tool.scope && (
              <span className="text-xs text-white/60">
                {labels.scope(tool.scope)}
              </span>
            )}
          </div>
          <p className="text-sm text-white/70">{tool.description}</p>
        </li>
      ))}
    </ul>
  );
}

export default async function DevelopersPage() {
  const t = await getTranslations("Developers");
  const scopes = await getTranslations("OAuthConsent.scopes");
  const url = mcpResource();
  const tools = listMcpTools();
  const labels = {
    scope: (scope: string) => t("tools.scope", { scope }),
    writes: t("tools.writes"),
    view: t("tools.view"),
  };

  const vscode = JSON.stringify(
    { servers: { "nexus-tools": { type: "http", url } } },
    null,
    2,
  );
  const cursor = JSON.stringify(
    { mcpServers: { "nexus-tools": { url } } },
    null,
    2,
  );
  const stdio = `npx -y mcp-remote ${url}`;

  return (
    <div className="m-2 mx-auto max-w-5xl space-y-4">
      <section className={CARD}>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p>{t("intro")}</p>
      </section>

      <section className={CARD}>
        <h2 className="text-xl font-semibold">{t("server.title")}</h2>
        <p>{t("server.url")}</p>
        <div className="flex flex-wrap items-center gap-2">
          <code className="rounded-lg bg-black/40 px-3 py-2 text-[#9ED0FF]">
            {url}
          </code>
          <CopyButton
            text={url}
            label={t("server.copy")}
            done={t("server.copied")}
          />
        </div>
        <p className="text-sm text-white/70">{t("server.transport")}</p>
      </section>

      <section className={CARD}>
        <h2 className="text-xl font-semibold">{t("connect.title")}</h2>
        <p>{t("connect.claude")}</p>
        <p>{t("connect.chatgpt")}</p>
        <p>{t("connect.vscode")}</p>
        <Code>{vscode}</Code>
        <p>{t("connect.cursor")}</p>
        <Code>{cursor}</Code>
        <p>{t("connect.stdio")}</p>
        <Code>{stdio}</Code>
        <p className="text-sm text-white/70">{t("connect.signIn")}</p>
      </section>

      <section className={CARD}>
        <h2 className="text-xl font-semibold">{t("account.title")}</h2>
        <p>{t("account.intro")}</p>
        <ul className="list-disc space-y-1 pl-6">
          {[...OIDC_SCOPES, ...MCP_SCOPES].map((scope) => (
            <li key={scope}>
              <code className="text-[#9ED0FF]">{scope}</code> — {scopes(scope)}
            </li>
          ))}
        </ul>
        <p>{t("account.confirm")}</p>
        <p>{t("account.revoke")}</p>
        <Button asChild variant="outline">
          <Link href="/settings#applications">{t("account.settings")}</Link>
        </Button>
      </section>

      <section className={CARD}>
        <h2 className="text-xl font-semibold">{t("apps.title")}</h2>
        <p>{t("apps.body")}</p>
      </section>

      <section className={CARD}>
        <h2 className="text-xl font-semibold">{t("tools.title")}</h2>
        <p className="text-sm text-white/70">
          {t("tools.intro", { count: tools.length })}
        </p>
        <h3 className="pt-2 font-semibold">{t("tools.public")}</h3>
        <ToolList tools={tools.filter((tool) => !tool.scope)} labels={labels} />
        <h3 className="pt-2 font-semibold">{t("tools.personal")}</h3>
        <ToolList tools={tools.filter((tool) => tool.scope)} labels={labels} />
      </section>

      <section className={CARD}>
        <h2 className="text-xl font-semibold">{t("limits.title")}</h2>
        <p>{t("limits.items")}</p>
        <p>
          {t("limits.fair")}{" "}
          <Link href="/cgu#api" className="text-[#9ED0FF] underline">
            {t("cgu")}
          </Link>
        </p>
      </section>

      <section className={CARD}>
        <h2 className="text-xl font-semibold">{t("api.title")}</h2>
        <p>{t("api.body")}</p>
        <p>{t("api.contact")}</p>
        <Button asChild>
          <Link href="/discord">{t("api.discord")}</Link>
        </Button>
      </section>
    </div>
  );
}

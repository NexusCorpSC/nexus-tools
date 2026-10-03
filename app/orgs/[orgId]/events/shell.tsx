import { getTranslations } from "next-intl/server";
import { headers } from "next/headers";
import db from "@/lib/db";
import { auth } from "@/lib/auth";
import type { Organization } from "@/app/orgs/page";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

/**
 * Le cadre commun des pages d'évènements.
 *
 * Hors du groupe `(accredited)` : un évènement public se lit sans être membre,
 * même dans une organisation privée. Ce que chacun peut voir, c'est
 * `lib/org-events.ts` qui le décide.
 */

export async function readerIdFromSession(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user?.id ?? null;
}

export async function orgName(orgId: string): Promise<string | null> {
  const org = await db
    .db()
    .collection<Organization>("organizations")
    .findOne({ _id: orgId }, { projection: { name: 1 } });
  return org?.name ?? null;
}

export async function EventsShell({
  orgId,
  name,
  trail,
  children,
}: {
  orgId: string;
  name: string;
  /** Les maillons après « Évènements » ; le dernier est la page courante. */
  trail: { label: string; href?: string }[];
  children: React.ReactNode;
}) {
  const t = await getTranslations("OrgEvents");
  const crumbs = [
    { label: t("title"), href: `/orgs/${orgId}/events` },
    ...trail,
  ];

  return (
    <div className="m-2 mx-auto max-w-5xl space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">{t("home")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/orgs">{t("organizations")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={`/orgs/${orgId}`}>{name}</BreadcrumbLink>
          </BreadcrumbItem>
          {crumbs.map((crumb, index) => (
            <span key={index} className="contents">
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                {index === crumbs.length - 1 || !crumb.href ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink href={crumb.href}>
                    {crumb.label}
                  </BreadcrumbLink>
                )}
              </BreadcrumbItem>
            </span>
          ))}
        </BreadcrumbList>
      </Breadcrumb>
      {children}
    </div>
  );
}

import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ObjectId } from "bson";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { getRequestDetail, listMyOrgs } from "@/lib/player-requests";
import { cn } from "@/lib/utils";
import { RequestForm } from "@/app/demandes/request-form";
import { PAGE_PANEL } from "@/app/demandes/ui";

export const metadata: Metadata = {
  title: "Modifier une demande",
  robots: { index: false, follow: false },
};

export default async function EditRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) redirect("/login");
  const userId = new ObjectId(session.user.id);
  const { id } = await params;
  const t = await getTranslations("Requests");
  const [detail, orgs] = await Promise.all([getRequestDetail(id, userId), listMyOrgs(userId)]);
  if (!detail || !detail.request.mine) notFound();

  return (
    <div className={cn(PAGE_PANEL, "max-w-2xl")}>
      <Link href={`/demandes/${id}`} className="text-sm text-[#CCE7FF] hover:underline">
        ← {detail.request.name}
      </Link>
      <h1 className="text-2xl font-bold text-[#E3F1FF]">{t("form.editTitle")}</h1>
      <RequestForm orgs={orgs} initial={detail.request} />
    </div>
  );
}

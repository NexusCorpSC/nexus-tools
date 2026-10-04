import { headers } from "next/headers";
import { ObjectId } from "mongodb";
import { auth } from "@/lib/auth";
import { getConfirmState } from "@/lib/confirmations";
import type { ConfirmSubject } from "@/types/contributions";
import { ConfirmPanel } from "./confirm-panel";

/** Le panneau de confirmation d'une donnée, avec où elle en est pour le lecteur. */
export async function ConfirmBlock({
  subject,
  slug,
  fixHref,
  className,
}: {
  subject: ConfirmSubject;
  slug: string;
  fixHref?: string;
  className?: string;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  const viewer = session?.user ? new ObjectId(session.user.id) : undefined;
  const state = await getConfirmState(subject, slug, viewer);
  if (!state) return null;

  return (
    <ConfirmPanel
      slug={slug}
      state={state}
      signedIn={Boolean(viewer)}
      fixHref={fixHref}
      className={className}
    />
  );
}

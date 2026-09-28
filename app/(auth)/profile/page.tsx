import Link from "next/link";
import db from "@/lib/db";
import type { Metadata } from "next";
import { ObjectId } from "bson";
import { Organization } from "@/app/orgs/page";
import Image from "next/image";
import { ChevronRightIcon, LogOutIcon } from "lucide-react";
import {
  AvatarUpdateComponent,
  CopyButton,
  NameUpdateComponent,
} from "@/app/(auth)/profile/components";
import { outlineButton } from "@/app/(auth)/profile/styles";
import { PresenceCard } from "@/app/(auth)/profile/presence-card";
import { FriendsSection } from "@/app/(auth)/profile/friends";
import { Button } from "@/components/ui/button";
import { getTranslations } from "next-intl/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getMyPresence } from "@/lib/presence";
import { getMyFriendCode, listFriends } from "@/lib/friends";

export const metadata: Metadata = {
  title: "Mon profil",
  description:
    "Gérez votre profil Nexus Tools : avatar, pseudo, amis, session de jeu et organisations.",
  robots: { index: false, follow: false },
};

export type User = {
  _id: ObjectId;
  avatar: string;
  name: string;
  email: string;
  defaultShopId?: string;
};

export default async function ProfilePage() {
  const t = await getTranslations("Profile");
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    return <>Not authenticated.</>;
  }

  const userId = new ObjectId(session.user.id);

  const user = await db.db().collection<User>("users").findOne({ _id: userId });

  if (!user) {
    return <>User not found.</>;
  }

  const [organizations, presence, friends, friendCode] = await Promise.all([
    db
      .db()
      .collection<Organization>("organizations")
      .find({ "members.userId": userId })
      .project<Pick<Organization, "_id" | "name" | "image" | "members">>({
        _id: 1,
        name: 1,
        image: 1,
        members: { $elemMatch: { userId } },
      })
      .limit(20)
      .toArray(),
    getMyPresence(userId),
    listFriends(userId),
    getMyFriendCode(userId),
  ]);

  const userIdText = user._id.toString();

  return (
    <div className="mx-auto max-w-7xl space-y-7 px-4 py-8 sm:px-6 lg:px-8 lg:py-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-1.5">
          <h1 className="text-3xl font-bold tracking-tight">{t("title")}</h1>
          <p className="text-[#A9CDEE]">{t("subtitle")}</p>
        </div>
        <form
          action={async () => {
            "use server";

            await auth.api.signOut({ headers: await headers() });
            redirect("/");
          }}
        >
          <Button type="submit" className={`h-10 ${outlineButton}`}>
            <LogOutIcon />
            {t("signOut")}
          </Button>
        </form>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
        {/* A column beside the friends on a wide screen; on a narrow one its
            cards join the grid, the organizations after the friends. */}
        <div className="contents lg:block lg:space-y-5">
          <section className="space-y-5 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6">
            <div className="flex items-center gap-4">
              <AvatarUpdateComponent
                userId={userIdText}
                avatar={user.avatar ?? null}
                name={user.name ?? "?"}
              />
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-1">
                  <h2 className="truncate text-2xl font-bold">
                    {user.name ?? "-"}
                  </h2>
                  <NameUpdateComponent currentName={user.name ?? ""} />
                </div>
                <p className="truncate text-sm text-[#A9CDEE]">
                  <span className="sr-only">{t("email")} : </span>
                  {user.email}
                </p>
              </div>
            </div>

            <div className="h-px bg-[#9ED0FF]/12" />

            <div className="space-y-1.5">
              <p className="text-xs font-medium tracking-wider text-[#86AED2] uppercase">
                {t("userId")}
              </p>
              <div className="flex h-10 items-center gap-2 rounded-lg bg-[#061E30]/70 pr-1 pl-3">
                <span className="flex-1 truncate font-mono text-sm text-[#CCE7FF]">
                  {userIdText}
                </span>
                <CopyButton value={userIdText} label={t("copyUserId")} />
              </div>
            </div>
          </section>

          <PresenceCard initial={presence} />

          <section className="order-last space-y-2 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 lg:order-none">
            <h2 className="mb-2 text-lg font-semibold">{t("organizations")}</h2>
            {organizations.length === 0 ? (
              <p className="text-sm text-[#A9CDEE]">{t("noOrganizations")}</p>
            ) : (
              <ul className="-mx-2.5">
                {organizations.map((org) => (
                  <li key={org._id.toString()}>
                    <Link
                      href={`/orgs/${org._id}`}
                      className="flex items-center gap-3.5 rounded-xl p-2.5 hover:bg-[#9ED0FF]/8"
                    >
                      {org.image ? (
                        <Image
                          src={org.image}
                          alt=""
                          width={44}
                          height={44}
                          className="size-11 shrink-0 rounded-lg border border-[#9ED0FF]/15 object-cover"
                        />
                      ) : (
                        <div className="flex size-11 shrink-0 items-center justify-center rounded-lg border border-[#9ED0FF]/15 bg-[#061E30] text-xs font-bold text-[#9ED0FF]">
                          {org.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{org.name}</p>
                        {org.members[0]?.rank ? (
                          <p className="truncate text-sm text-[#A9CDEE]">
                            {org.members[0].rank}
                          </p>
                        ) : null}
                      </div>
                      <ChevronRightIcon className="size-4.5 shrink-0 text-[#86AED2]" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <FriendsSection initialFriends={friends} initialCode={friendCode} />
      </div>
    </div>
  );
}

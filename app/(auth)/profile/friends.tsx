"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import {
  CheckIcon,
  EllipsisIcon,
  KeyRoundIcon,
  UserPlusIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { CopyButton, Initial } from "@/app/(auth)/profile/components";
import { outlineButton } from "@/app/(auth)/profile/styles";
import {
  formatFriendCode,
  type Friend,
  type FriendErrorCode,
  type FriendList,
  type MyFriendCode,
} from "@/types/friends";
import { formatElapsed } from "@/types/presence";

/** As the organization pages: often enough to see a friend arrive. */
const REFRESH_MS = 30_000;

const KNOWN_ERRORS: FriendErrorCode[] = [
  "invalid_code",
  "not_found",
  "own_code",
  "already_friends",
  "too_many_attempts",
];

/**
 * The friends of the profile: the code to hand out, the field to type one in,
 * and the list — those playing first, with what they declared.
 */
export function FriendsSection({
  initialFriends,
  initialCode,
}: {
  initialFriends: Friend[];
  initialCode: string | null;
}) {
  const t = useTranslations("Profile.Friends");

  const [friends, setFriends] = useState(initialFriends);
  const [code, setCode] = useState(initialCode);
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    const [friendsResponse, codeResponse] = await Promise.all([
      fetch("/api/me/friends", { cache: "no-store" }),
      fetch("/api/me/friends/code", { cache: "no-store" }),
    ]);
    if (friendsResponse.ok) {
      setFriends(((await friendsResponse.json()) as FriendList).friends);
    }
    // A code someone just used is gone: the card goes back to «Générer».
    if (codeResponse.ok) {
      setCode(((await codeResponse.json()) as MyFriendCode).code);
    }
    setNow(Date.now());
  }, []);

  useEffect(() => {
    const timer = setInterval(() => void refresh(), REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const playing = friends.filter((friend) => friend.playing);
  const offline = friends.filter((friend) => !friend.playing);

  return (
    <section
      id="amis"
      className="scroll-mt-24 space-y-6 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 sm:p-7"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-2xl font-bold">{t("title")}</h2>
        <p className="text-sm text-[#A9CDEE]">
          <span className="font-semibold text-emerald-300">
            {t("playingCount", { count: playing.length })}
          </span>
          {" · "}
          {t("total", { count: friends.length })}
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <FriendCodeCard code={code} onCode={setCode} />
        <AddFriendCard
          onAdded={(friend) => {
            setFriends((current) => [
              ...current.filter((other) => other.userId !== friend.userId),
              friend,
            ]);
            void refresh();
          }}
        />
      </div>

      {friends.length === 0 ? (
        <p className="text-sm text-[#A9CDEE]">{t("empty")}</p>
      ) : (
        <>
          <div className="space-y-2">
            <h3 className="text-xs font-semibold tracking-widest text-emerald-300 uppercase">
              {t("playingHeading", { count: playing.length })}
            </h3>
            {playing.length === 0 ? (
              <p className="text-sm text-[#A9CDEE]">{t("nobodyPlaying")}</p>
            ) : (
              <ul className="space-y-2">
                {playing.map((friend) => (
                  <FriendRow
                    key={friend.userId}
                    friend={friend}
                    now={now}
                    onRemoved={() => void refresh()}
                  />
                ))}
              </ul>
            )}
          </div>

          {offline.length > 0 ? (
            <div className="space-y-1">
              <h3 className="mb-2 text-xs font-semibold tracking-widest text-[#86AED2] uppercase">
                {t("offlineHeading", { count: offline.length })}
              </h3>
              <ul>
                {offline.map((friend) => (
                  <FriendRow
                    key={friend.userId}
                    friend={friend}
                    now={now}
                    onRemoved={() => void refresh()}
                  />
                ))}
              </ul>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function FriendCodeCard({
  code,
  onCode,
}: {
  code: string | null;
  onCode: (code: string) => void;
}) {
  const t = useTranslations("Profile.Friends");
  const [pending, setPending] = useState(false);

  async function generate() {
    setPending(true);
    try {
      const response = await fetch("/api/me/friends/code", { method: "POST" });
      if (!response.ok) throw new Error(String(response.status));
      const body: MyFriendCode = await response.json();
      if (body.code) onCode(body.code);
    } catch {
      toast.error(t("errors.unknown"));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-[#9ED0FF]/10 bg-[#061E30]/60 p-4">
      <div className="flex items-center gap-2.5">
        <KeyRoundIcon className="size-4.5 text-[#9ED0FF]" />
        <h3 className="font-semibold">{t("codeTitle")}</h3>
      </div>
      {code ? (
        <>
          <div className="flex items-center gap-2">
            <span className="flex h-11 flex-1 items-center rounded-lg border border-dashed border-[#9ED0FF]/40 bg-[#0B3A5A]/70 px-3.5 font-mono text-xl font-medium tracking-[0.12em] text-[#E3F1FF] select-all">
              {formatFriendCode(code)}
            </span>
            <CopyButton
              value={formatFriendCode(code)}
              label={t("codeTitle")}
              withText
            />
          </div>
          <p className="text-xs leading-relaxed text-[#86AED2]">
            {t("codeUsage")}
          </p>
        </>
      ) : (
        <>
          <p className="text-sm leading-relaxed text-[#A9CDEE]">
            {t("codeHint")}
          </p>
          <Button
            type="button"
            onClick={() => void generate()}
            disabled={pending}
            className="h-11 w-full"
          >
            {t("generate")}
          </Button>
        </>
      )}
    </div>
  );
}

function AddFriendCard({ onAdded }: { onAdded: (friend: Friend) => void }) {
  const t = useTranslations("Profile.Friends");
  const [value, setValue] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<string | null>(null);

  async function add() {
    setPending(true);
    setError(null);
    setAdded(null);
    try {
      const response = await fetch("/api/me/friends", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: value }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: FriendErrorCode;
        };
        setError(
          body.error && KNOWN_ERRORS.includes(body.error)
            ? t(`errors.${body.error}`)
            : t("errors.unknown"),
        );
        return;
      }
      const friend: Friend = await response.json();
      setValue("");
      setAdded(friend.name);
      onAdded(friend);
    } catch {
      setError(t("errors.unknown"));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      className="space-y-3 rounded-xl border border-[#9ED0FF]/10 bg-[#061E30]/60 p-4"
      onSubmit={(event) => {
        event.preventDefault();
        void add();
      }}
    >
      <div className="flex items-center gap-2.5">
        <UserPlusIcon className="size-4.5 text-[#9ED0FF]" />
        <h3 className="font-semibold">{t("addTitle")}</h3>
      </div>
      <div className="flex gap-2">
        <label className="flex-1">
          <span className="sr-only">{t("codeLabel")}</span>
          <input
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
            placeholder="XXXX-XXXX"
            maxLength={12}
            autoComplete="off"
            spellCheck={false}
            aria-invalid={error ? true : undefined}
            className={`block h-11 w-full rounded-lg border bg-[#0B3A5A]/70 px-3.5 font-mono text-base tracking-[0.12em] text-[#E3F1FF] uppercase placeholder:text-[#7FA6C8] focus:ring-0 ${
              error
                ? "border-red-300 focus:border-red-300"
                : "border-[#9ED0FF]/20 focus:border-[#9ED0FF]/60"
            }`}
          />
        </label>
        <Button
          type="submit"
          disabled={pending || value.trim() === ""}
          className="h-11"
        >
          {t("add")}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      ) : added ? (
        <p
          role="status"
          className="flex items-center gap-2 text-sm text-emerald-300"
        >
          <CheckIcon className="size-4" />
          {t("added", { name: added })}
        </p>
      ) : (
        <p className="text-xs leading-relaxed text-[#86AED2]">{t("addHint")}</p>
      )}
    </form>
  );
}

function FriendRow({
  friend,
  now,
  onRemoved,
}: {
  friend: Friend;
  now: number;
  onRemoved: () => void;
}) {
  const t = useTranslations("Profile.Friends");
  const playing = friend.playing;

  return (
    <li
      className={
        playing
          ? "flex items-center gap-3 rounded-xl border border-emerald-300/20 bg-[#061E30]/60 px-3.5 py-3"
          : "flex items-center gap-3 px-3.5 py-2"
      }
    >
      <div className="relative shrink-0">
        {friend.avatar ? (
          <Image
            src={friend.avatar}
            alt=""
            width={44}
            height={44}
            unoptimized
            className={`rounded-full object-cover ${playing ? "size-11" : "size-9 opacity-80"}`}
          />
        ) : (
          <Initial
            name={friend.name}
            className={
              playing ? "size-11 text-lg" : "size-9 text-sm opacity-80"
            }
          />
        )}
        {playing ? (
          <span className="absolute -right-0.5 -bottom-0.5 size-3 rounded-full border-2 border-[#061E30] bg-emerald-300" />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <p
          className={`truncate ${playing ? "font-semibold" : "font-medium text-[#CFE4F7]"}`}
        >
          {friend.name}
        </p>
        <p className="truncate text-sm text-[#86AED2] sm:text-[#A9CDEE]">
          {playing ? (
            <span className="text-emerald-300 sm:hidden">
              {playing.activity ?? t("noActivity")}
            </span>
          ) : null}
          <span className={playing ? "hidden sm:inline" : ""}>
            {friend.sharedOrg ?? t("noSharedOrg")}
          </span>
        </p>
      </div>

      {playing ? (
        <>
          <span className="hidden max-w-56 truncate rounded-full bg-emerald-300/12 px-2.5 py-1 text-sm font-medium text-emerald-300 sm:inline">
            {playing.activity ?? t("noActivity")}
          </span>
          <span className="w-16 shrink-0 text-right text-sm text-[#86AED2]">
            {formatElapsed(playing.since, now)}
          </span>
        </>
      ) : null}

      <RemoveFriendMenu friend={friend} onRemoved={onRemoved} />
    </li>
  );
}

function RemoveFriendMenu({
  friend,
  onRemoved,
}: {
  friend: Friend;
  onRemoved: () => void;
}) {
  const t = useTranslations("Profile.Friends");
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function remove() {
    setPending(true);
    try {
      const response = await fetch(`/api/me/friends/${friend.userId}`, {
        method: "DELETE",
      });
      // Already gone is what was asked for.
      if (!response.ok && response.status !== 404) {
        throw new Error(String(response.status));
      }
      toast.success(t("removed", { name: friend.name }));
      setOpen(false);
      onRemoved();
    } catch {
      toast.error(t("removeError"));
    } finally {
      setPending(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={t("options", { name: friend.name })}
          className="shrink-0 text-[#86AED2] hover:bg-[#9ED0FF]/10 hover:text-[#E3F1FF]"
        >
          <EllipsisIcon />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-72 space-y-3 border-[#9ED0FF]/20 bg-[#0B3A5A] text-[#E3F1FF]"
      >
        <p className="text-sm leading-relaxed text-[#CFE4F7]">
          {t("removeConfirm", { name: friend.name })}
        </p>
        <div className="flex justify-end gap-2">
          <Button
            type="button"
            size="sm"
            className={outlineButton}
            onClick={() => setOpen(false)}
          >
            {t("cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={pending}
            onClick={() => void remove()}
          >
            {t("remove")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

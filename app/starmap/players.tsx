"use client";

import {
  useCallback,
  useEffect,
  useState,
  useSyncExternalStore,
  useTransition,
} from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  PlacePositionField,
  type PositionValue,
} from "@/app/admin/lieux/components/place-position-field";
import {
  PLAYERS_REFRESH_MS,
  POSITION_STALE_MS,
  type MyPositionSharing,
  type PlayerInGame,
} from "@/types/player-positions";

const SELECT =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

/**
 * Les joueurs en jeu que je vois, relus régulièrement tant que la page est
 * visible. `null` : personne n'est connecté, rien à relire.
 */
export function usePlayers(initial: PlayerInGame[] | null) {
  const [players, setPlayers] = useState(initial);
  const signedIn = initial !== null;

  const refresh = async () => {
    const response = await fetch("/api/starmap/joueurs", {
      cache: "no-store",
    }).catch(() => null);
    if (!response?.ok) return;
    const data = (await response.json().catch(() => null)) as {
      players?: PlayerInGame[];
    } | null;
    if (data?.players) setPlayers(data.players);
  };

  useEffect(() => {
    if (!signedIn) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState === "visible") await refresh();
      if (!stopped) timer = setTimeout(tick, PLAYERS_REFRESH_MS);
    };
    timer = setTimeout(tick, PLAYERS_REFRESH_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [signedIn]);

  return { players, refresh };
}

const noop = () => () => {};

/**
 * Vrai une fois dans le navigateur. Les âges des relevés se comptent en
 * secondes : rendus par le serveur, ils ne correspondraient plus à
 * l'hydratation.
 */
function useMounted() {
  return useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
}

/** Un relevé de plus de deux minutes : le joueur s'estompe. */
export function isStale(player: PlayerInGame, now: number): boolean {
  return now - Date.parse(player.at) > POSITION_STALE_MS;
}

/** Le genre de rond d'un joueur : moi, un ami, ou un membre d'orga. */
export function playerKind(player: PlayerInGame): "me" | "friend" | "org" {
  return player.me ? "me" : player.friend ? "friend" : "org";
}

/** Son rond : son avatar, sinon son initiale. */
export function PlayerAvatar({
  player,
  size = 26,
}: {
  player: PlayerInGame;
  size?: number;
}) {
  const kind = playerKind(player);
  return (
    <i
      aria-hidden
      className={`star-map-avatar ${kind === "friend" ? "" : kind} not-italic`}
      style={{
        width: size,
        height: size,
        fontSize: size * 0.42,
        backgroundImage: player.avatar ? `url("${player.avatar}")` : undefined,
      }}
    >
      {player.avatar ? "" : (player.name.trim()[0] ?? "?").toUpperCase()}
    </i>
  );
}

/** Où il est, en mots : son corps, sinon l'espace de son système. */
export function usePlaceOf() {
  const t = useTranslations("StarMap.players");
  // Stable : la Star Map en dépend pour ne replacer les joueurs qu'à bon escient.
  return useCallback(
    (player: PlayerInGame) =>
      player.bodyName ??
      t("inSpace", { system: player.systemName ?? player.systemSlug }),
    [t],
  );
}

/**
 * La distance entre deux joueurs, en mètres, quand elle se calcule sans les
 * corps : sur le même corps (même repère), ou tous deux dans l'espace du même
 * système. `null` sinon.
 */
export function distanceBetween(
  a: PlayerInGame,
  b: PlayerInGame,
): number | null {
  if (a.systemSlug !== b.systemSlug) return null;
  if ((a.position.body ?? null) !== (b.position.body ?? null)) return null;
  return Math.hypot(
    a.position.x - b.position.x,
    a.position.y - b.position.y,
    a.position.z - b.position.z,
  );
}

/** « 3,4 km », « 1,2 Gm » : une distance lisible. */
export function useDistance() {
  const format = useFormatter();
  return (metres: number) => {
    if (metres < 1000) return `${format.number(Math.round(metres))} m`;
    if (metres < 1e6)
      return `${format.number(metres / 1000, { maximumFractionDigits: 1 })} km`;
    if (metres < 1e9)
      return `${format.number(metres / 1e6, { maximumFractionDigits: 1 })} Mm`;
    return `${format.number(metres / 1e9, { maximumFractionDigits: 1 })} Gm`;
  };
}

/** Ses étiquettes : « ami », et les organisations par lesquelles je le vois. */
function Tags({ player }: { player: PlayerInGame }) {
  const t = useTranslations("StarMap.players");
  return (
    <>
      {player.me && (
        <span className="rounded border border-white/40 px-1 font-mono text-[10px] font-bold text-white">
          {t("me")}
        </span>
      )}
      {player.friend && (
        <span className="rounded border border-[#ff9f7a]/45 px-1 font-mono text-[10px] font-bold text-[#ff9f7a]">
          {t("friend")}
        </span>
      )}
      {player.orgs.map((org) => (
        <span
          key={org.id}
          title={org.name}
          className="rounded border border-[#9ED0FF]/30 px-1 font-mono text-[10px] font-bold text-[#a9cdee]"
        >
          {org.tag ?? org.name}
        </span>
      ))}
    </>
  );
}

/** La liste « En jeu » du panneau : un clic suit le joueur. */
export function PlayersSection({
  players,
  me,
  onSelect,
}: {
  players: PlayerInGame[];
  me: PlayerInGame | undefined;
  onSelect: (id: string) => void;
}) {
  const t = useTranslations("StarMap.players");
  const format = useFormatter();
  const now = useNow({ updateInterval: 10_000 });
  const placeOf = usePlaceOf();
  const distance = useDistance();
  const mounted = useMounted();
  return (
    <section className="px-4 pt-3">
      <h3 className="mb-1.5 flex items-baseline justify-between text-[11px] font-semibold tracking-[0.1em] text-[#ff9f7a] uppercase">
        {t("title")}
        <small className="font-mono font-normal text-[#5c7b96]">
          {players.length}
        </small>
      </h3>
      <div className="grid gap-px">
        {players.map((player) => {
          const stale = mounted && isStale(player, now.getTime());
          const away = me && !player.me ? distanceBetween(me, player) : null;
          return (
            <button
              key={player.userId}
              type="button"
              onClick={() => onSelect(player.userId)}
              className={`-mx-2 flex min-w-0 items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-[#ff9f7a]/10 ${stale ? "opacity-60" : ""}`}
            >
              <PlayerAvatar player={player} />
              <span className="grid min-w-0 flex-1">
                <span className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-medium">
                  <span className="truncate">{player.name}</span>
                  <Tags player={player} />
                </span>
                <span className="truncate text-[11.5px] text-[#86a9c8]">
                  {[player.activity, placeOf(player)]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="grid shrink-0 justify-items-end">
                {away !== null && (
                  <span className="font-mono text-[12px] tabular-nums">
                    {distance(away)}
                  </span>
                )}
                <span
                  className={`text-[11px] ${stale ? "text-[#5c7b96]" : "text-[#7ff0d0]"}`}
                >
                  {mounted
                    ? format.relativeTime(new Date(player.at), now)
                    : "\u00a0"}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** La fiche d'un joueur suivi, en tête du panneau. */
export function PlayerCard({
  player,
  me,
  onClose,
}: {
  player: PlayerInGame;
  me: PlayerInGame | undefined;
  onClose: () => void;
}) {
  const t = useTranslations("StarMap.players");
  const format = useFormatter();
  const now = useNow({ updateInterval: 10_000 });
  const placeOf = usePlaceOf();
  const distance = useDistance();
  const [copied, setCopied] = useState(false);
  const mounted = useMounted();
  const away = me && !player.me ? distanceBetween(me, player) : null;
  const stale = mounted && isStale(player, now.getTime());
  const { x, y, z } = player.position;
  // Dans l'espace, une ligne /showlocation : le NPS de l'app sait la coller
  // comme destination. Sur un corps, les X, Y, Z de son repère, en km.
  const line = player.position.body
    ? `${player.bodyName ?? player.position.body} X ${(x / 1000).toFixed(3)} km Y ${(y / 1000).toFixed(3)} km Z ${(z / 1000).toFixed(3)} km`
    : `Coordinates: x:${x.toFixed(1)} y:${y.toFixed(1)} z:${z.toFixed(1)}`;
  const kindLabel = player.me
    ? t("kindMe")
    : player.friend
      ? t("kindFriend")
      : t("kindOrg");

  return (
    <div className="grid gap-2 border-b border-[#9ED0FF]/20 px-4 pt-4 pb-3">
      <p className="font-mono text-[10.5px] tracking-[0.12em] text-[#86a9c8] uppercase">
        {kindLabel}
      </p>
      <div className="flex items-center gap-3">
        <PlayerAvatar player={player} size={44} />
        <div className="grid min-w-0 gap-1">
          <h2 className="truncate text-xl font-semibold">{player.name}</h2>
          <div className="flex flex-wrap gap-1">
            <Tags player={player} />
          </div>
        </div>
      </div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
        <dt className="text-[#5c7b96]">{t("activity")}</dt>
        <dd>
          {mounted
            ? t("playingSince", {
                activity: player.activity ?? t("noActivity"),
                since: format.relativeTime(new Date(player.since), now),
              })
            : (player.activity ?? t("noActivity"))}
        </dd>
        <dt className="text-[#5c7b96]">{t("where")}</dt>
        <dd>{placeOf(player)}</dd>
        <dt className="text-[#5c7b96]">{t("reading")}</dt>
        <dd>
          <span className={stale ? "text-[#5c7b96]" : "text-[#7ff0d0]"}>
            {mounted ? format.relativeTime(new Date(player.at), now) : ""}
          </span>
          {" · "}
          {t(`sources.${player.source}`)}
        </dd>
        {away !== null && (
          <>
            <dt className="text-[#5c7b96]">{t("fromYou")}</dt>
            <dd className="font-mono tabular-nums">{distance(away)}</dd>
          </>
        )}
      </dl>
      <div className="mt-1 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={onClose}
          className="rounded-md border border-[#9ED0FF]/50 px-2.5 py-1 text-xs font-medium hover:bg-[#9ED0FF]/15"
        >
          {t("close")}
        </button>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(line).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
          className="rounded-md border border-[#ff9f7a]/45 bg-[#ff9f7a]/10 px-2.5 py-1 text-xs font-medium text-[#ff9f7a] hover:bg-[#ff9f7a]/20"
        >
          {copied ? t("copied") : t("copy")}
        </button>
      </div>
    </div>
  );
}

/**
 * « Ma position » : coller un relevé (ou saisir X, Y, Z) et choisir qui le
 * voit. Le réglage est celui du NPS de l'app : le même, sur le compte.
 */
export function MyPositionDialog({
  initial,
  systems,
  onClose,
  onSaved,
}: {
  initial: MyPositionSharing;
  systems: { slug: string; name: string }[];
  onClose: () => void;
  onSaved: (sharing: MyPositionSharing) => Promise<void>;
}) {
  const t = useTranslations("StarMap.myPosition");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [friends, setFriends] = useState(
    initial.sharing.enabled ? initial.sharing.friends : true,
  );
  // À la première activation, toutes mes organisations sont cochées.
  const [orgIds, setOrgIds] = useState<Set<string>>(
    new Set(
      initial.sharing.enabled || initial.sharing.orgIds.length > 0
        ? initial.sharing.orgIds
        : initial.orgs.map((org) => org.id),
    ),
  );
  const [systemSlug, setSystemSlug] = useState(
    initial.position?.systemSlug ??
      systems.find((system) => system.slug === "stanton")?.slug ??
      systems[0]?.slug ??
      "",
  );
  const [position, setPosition] = useState<PositionValue>(null);

  const put = (url: string, body: unknown) =>
    fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => null);

  const share = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (position === "invalid") {
      setError(t("positionInvalid"));
      return;
    }
    if (!position && !initial.position) {
      setError(t("positionRequired"));
      return;
    }
    startTransition(async () => {
      const saved = await put("/api/me/position-sharing", {
        enabled: true,
        friends,
        orgIds: [...orgIds],
      });
      if (!saved?.ok) {
        setError(t("failed"));
        return;
      }
      let sharing = (await saved.json()) as MyPositionSharing;
      if (position) {
        const sent = await put("/api/me/position", {
          systemSlug,
          position,
          source: "paste",
        });
        if (!sent?.ok) {
          setError(t("failed"));
          return;
        }
        sharing = { ...sharing, position: await sent.json(), playing: true };
      }
      await onSaved(sharing);
      onClose();
    });
  };

  const stop = () =>
    startTransition(async () => {
      const saved = await put("/api/me/position-sharing", { enabled: false });
      if (!saved?.ok) {
        setError(t("failed"));
        return;
      }
      await onSaved((await saved.json()) as MyPositionSharing);
      onClose();
    });

  const toggleOrg = (id: string) =>
    setOrgIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[#ff9f7a]">{t("title")}</DialogTitle>
          <DialogDescription>{t("hint")}</DialogDescription>
        </DialogHeader>

        <form id="my-position-form" onSubmit={share} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="my-position-system">{t("system")}</Label>
            <select
              id="my-position-system"
              value={systemSlug}
              onChange={(event) => setSystemSlug(event.target.value)}
              className={SELECT}
            >
              {systems.map((system) => (
                <option key={system.slug} value={system.slug}>
                  {system.name}
                </option>
              ))}
            </select>
          </div>
          <PlacePositionField
            key={systemSlug}
            systemSlug={systemSlug}
            onChange={setPosition}
          />

          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">{t("audience")}</legend>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={friends}
                onChange={(event) => setFriends(event.target.checked)}
                className="size-4 accent-[#ff9f7a]"
              />
              {t("friends")}
              <span className="ml-auto font-mono text-xs text-muted-foreground">
                {initial.friends}
              </span>
            </label>
            {initial.orgs.map((org) => (
              <label key={org.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={orgIds.has(org.id)}
                  onChange={() => toggleOrg(org.id)}
                  className="size-4 accent-[#ff9f7a]"
                />
                {org.name}
                {org.tag && (
                  <span className="rounded border border-[#9ED0FF]/30 px-1 font-mono text-[10px] font-bold">
                    {org.tag}
                  </span>
                )}
                <span className="ml-auto font-mono text-xs text-muted-foreground">
                  {t("members", { count: org.members })}
                </span>
              </label>
            ))}
          </fieldset>

          <p className="text-xs text-muted-foreground">
            {initial.playing ? t("playing") : t("notPlaying")}
          </p>
        </form>

        {error && <p className="text-sm text-red-400">{error}</p>}

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          {initial.sharing.enabled ? (
            <Button
              variant="ghost"
              className="text-red-300"
              disabled={isPending}
              onClick={stop}
            >
              {t("stop")}
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" disabled={isPending} onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button
              type="submit"
              form="my-position-form"
              disabled={isPending}
              className="bg-[#ff9f7a] font-semibold text-[#2b1006] hover:bg-[#ff9f7a]/90"
            >
              {position ? t("share") : t("save")}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

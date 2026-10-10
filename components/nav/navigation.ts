import type { LucideIcon } from "lucide-react";
import {
  Archive,
  Bot,
  Building2,
  CalendarDays,
  Coins,
  Container,
  Crosshair,
  Database,
  Flag,
  FlaskConical,
  Hammer,
  MapPin,
  NotebookPen,
  Package,
  Receipt,
  Rocket,
  Send,
  Star,
  Store,
  Tag,
  Trophy,
  Puzzle as PuzzleIcon,
  User,
  UserRound,
  Users,
} from "lucide-react";

/**
 * The site's menu: four categories, the same groups as Nexus App's
 * («Base de données», «Mon espace»), each page at most two gestures away.
 *
 * Labels and one-line descriptions live in `messages/*.json` under
 * `TopBar.menu`, by the ids below.
 */

export type NavItem = {
  id: string;
  href: string;
  icon: LucideIcon;
  /**
   * Other paths that belong to this page, for the current-page highlight:
   * a hub page it replaces, or a detail page under another prefix.
   */
  alsoMatches?: string[];
};

export type NavCategory = {
  id: "database" | "economy" | "mySpace" | "community";
  icon: LucideIcon;
  items: NavItem[];
};

export const NAV_CATEGORIES: NavCategory[] = [
  {
    id: "database",
    icon: Database,
    items: [
      { id: "items", href: "/items", icon: Package },
      { id: "places", href: "/lieux", icon: MapPin },
      { id: "missions", href: "/missions", icon: Rocket },
      { id: "factions", href: "/missions/factions", icon: Flag },
      {
        id: "blueprints",
        href: "/crafting/blueprints",
        icon: Hammer,
        // «Artisanat» only led here.
        alsoMatches: ["/crafting"],
      },
    ],
  },
  {
    id: "economy",
    icon: Coins,
    items: [
      {
        id: "marketplace",
        href: "/shopping",
        icon: Store,
        alsoMatches: ["/shops"],
      },
      { id: "sell", href: "/shopping/sell", icon: Tag },
      { id: "orders", href: "/shopping/my-orders", icon: Receipt },
      {
        id: "refine",
        href: "/industry/refine",
        icon: FlaskConical,
        // «Industrie» only led here and to the cargo.
        alsoMatches: ["/industry"],
      },
      { id: "cargo", href: "/industry/cargo", icon: Container },
    ],
  },
  {
    id: "mySpace",
    icon: User,
    items: [
      { id: "inventory", href: "/inventory", icon: Archive },
      { id: "parcels", href: "/inventory/parcels", icon: Send },
      { id: "reputations", href: "/reps", icon: Star },
      { id: "notes", href: "/notes", icon: NotebookPen },
      { id: "chat", href: "/chat", icon: Bot },
    ],
  },
  {
    id: "community",
    icon: Users,
    items: [
      { id: "friends", href: "/profile#amis", icon: UserRound },
      { id: "squads", href: "/squads", icon: Crosshair },
      { id: "organizations", href: "/orgs", icon: Building2 },
      { id: "events", href: "/events", icon: CalendarDays },
      { id: "leaderboard", href: "/classement", icon: Trophy },
      { id: "missing", href: "/ce-qui-manque", icon: PuzzleIcon },
    ],
  },
];

/** `/missions` covers `/missions/42`, not `/missionsx`. */
function covers(prefix: string, pathname: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * The page of the menu the reader is on: the item whose path covers theirs
 * most closely, so `/missions/factions` is Factions rather than Missions.
 * `null` off the menu — the home page, the profile, the legal pages.
 */
export function currentNavItem(
  pathname: string,
): { category: NavCategory; item: NavItem } | null {
  let best: { category: NavCategory; item: NavItem; length: number } | null =
    null;

  for (const category of NAV_CATEGORIES) {
    for (const item of category.items) {
      const own = item.href.split("#")[0];
      // A link to a section of another page is not that page.
      const paths = item.href.includes("#")
        ? (item.alsoMatches ?? [])
        : [own, ...(item.alsoMatches ?? [])];

      for (const path of paths) {
        if (covers(path, pathname) && (!best || path.length > best.length)) {
          best = { category, item, length: path.length };
        }
      }
    }
  }

  return best ? { category: best.category, item: best.item } : null;
}

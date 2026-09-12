import {
  Anchor,
  BatteryCharging,
  Bell,
  Bomb,
  Box,
  Coins,
  Cog,
  Compass,
  Cross,
  Crosshair,
  Diamond,
  Eye,
  Flag,
  Flame,
  Fuel,
  Gauge,
  Ghost,
  HardHat,
  Hammer,
  HeartPulse,
  Hexagon,
  KeyRound,
  LifeBuoy,
  Map,
  MapPin,
  Minus,
  Navigation,
  Orbit,
  Pill,
  Plane,
  Radio,
  Rocket,
  Search,
  Shield,
  ShieldHalf,
  Skull,
  Star,
  Sword,
  Target,
  Triangle,
  Truck,
  Users,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { Squad, SquadRole, SquadRoleIcon } from "@/types/squad";

/**
 * The glyph half of a role.
 *
 * The API stores a name, not a drawing: a role travels as `"heart-pulse"` and
 * each client decides what that looks like. This table holds every name in
 * `SQUAD_ROLE_ICONS`, and is the same one the desktop overlay draws from, so a
 * role looks the same on the site and over the game.
 *
 * Monochrome on purpose: on a member's row the colour already says whether
 * they are ready or down, and a second colour competing with that one is how a
 * glance stops being enough.
 */
const GLYPHS: Record<SquadRoleIcon, LucideIcon> = {
  crosshair: Crosshair,
  target: Target,
  sword: Sword,
  shield: Shield,
  "shield-half": ShieldHalf,
  bomb: Bomb,
  flame: Flame,
  zap: Zap,
  skull: Skull,
  navigation: Navigation,
  rocket: Rocket,
  plane: Plane,
  compass: Compass,
  anchor: Anchor,
  fuel: Fuel,
  gauge: Gauge,
  orbit: Orbit,
  cross: Cross,
  "heart-pulse": HeartPulse,
  pill: Pill,
  "life-buoy": LifeBuoy,
  battery: BatteryCharging,
  users: Users,
  bell: Bell,
  radio: Radio,
  wrench: Wrench,
  hammer: Hammer,
  cog: Cog,
  box: Box,
  truck: Truck,
  "hard-hat": HardHat,
  coins: Coins,
  key: KeyRound,
  eye: Eye,
  search: Search,
  map: Map,
  "map-pin": MapPin,
  flag: Flag,
  star: Star,
  hexagon: Hexagon,
  triangle: Triangle,
  diamond: Diamond,
  ghost: Ghost,
};

export function RoleIcon({
  icon,
  className,
}: {
  /** Absent, or a name this build does not know: the dash that means «none». */
  icon: SquadRoleIcon | undefined;
  className?: string;
}) {
  const Glyph = (icon && GLYPHS[icon]) || Minus;

  return <Glyph className={cn("size-4", className)} aria-hidden="true" />;
}

/**
 * The role a member is wearing, or `null` — which covers both «none chosen»
 * and an id that resolves to nothing, a role someone deleted between two polls.
 */
export function roleOf(squad: Squad, roleId: string): SquadRole | null {
  if (!roleId) return null;

  return squad.roles.find((role) => role.id === roleId) ?? null;
}

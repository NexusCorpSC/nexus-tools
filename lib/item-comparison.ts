/**
 * Met plusieurs objets d'un même type en lignes comparables.
 *
 * Les lignes sont décrites ici plutôt que dans la vue : chaque type d'objet
 * sait ce qui mérite d'être comparé, dans quel sens la valeur se lit (une
 * masse se lit à l'envers d'une vitesse) et si une barre de proportion a du
 * sens. Une ligne que personne ne renseigne disparaît — un tableau de tirets
 * n'apprend rien.
 */

import {
  isNumber,
  type ComparisonGroup,
  type ComparisonRow,
  type ComparisonValue,
  type Item,
  type ItemSlot,
  type ItemStatistics,
} from "@/types/items";

type RowSpec = Omit<ComparisonRow, "values"> & {
  read: (item: Item) => ComparisonValue;
};

type GroupSpec = {
  key: string;
  rows: RowSpec[];
};

function numberOf(value: unknown): ComparisonValue {
  return isNumber(value) ? value : null;
}

function textOf(value: unknown): ComparisonValue {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/** Un bloc d'emplacements absent n'est pas un bloc vide : 0 se mérite. */
function countOf(slots: ItemSlot[] | undefined): ComparisonValue {
  return slots ? slots.length : null;
}

const IDENTITY: GroupSpec = {
  key: "identity",
  rows: [
    {
      key: "manufacturer",
      labelKey: "manufacturer",
      read: (item) => textOf(item.manufacturer),
    },
    {
      key: "category",
      labelKey: "category",
      read: (item) =>
        [item.category, item.subcategory].filter(Boolean).join(" › ") || null,
    },
    { key: "tier", labelKey: "tier", read: (item) => numberOf(item.tier) },
    { key: "size", labelKey: "size", read: (item) => numberOf(item.size) },
    {
      key: "variantName",
      labelKey: "variant",
      read: (item) => textOf(item.variantName),
    },
    {
      key: "setName",
      labelKey: "set",
      read: (item) => textOf(item.setName),
    },
  ],
};

const VEHICLE_GROUPS: GroupSpec[] = [
  {
    key: "performance",
    rows: [
      {
        key: "speedScm",
        labelKey: "speedScm",
        unit: "m/s",
        direction: 1,
        delta: "pct",
        bar: true,
        read: (item) => numberOf(item.vehicle?.speedScm),
      },
      {
        key: "speedMax",
        labelKey: "speedMax",
        unit: "m/s",
        direction: 1,
        delta: "pct",
        read: (item) => numberOf(item.vehicle?.speedMax),
      },
    ],
  },
  {
    key: "capacity",
    rows: [
      {
        key: "crew",
        labelKey: "crew",
        direction: 1,
        delta: "abs",
        read: (item) => numberOf(item.vehicle?.crew),
      },
      {
        key: "cargoScu",
        labelKey: "cargoScu",
        unit: "SCU",
        direction: 1,
        delta: "pct",
        bar: true,
        read: (item) => numberOf(item.vehicle?.cargoScu),
      },
      {
        key: "mass",
        labelKey: "mass",
        unit: "kg",
        direction: -1,
        delta: "pct",
        read: (item) => numberOf(item.vehicle?.mass),
      },
    ],
  },
  {
    key: "dimensions",
    rows: [
      {
        key: "length",
        labelKey: "length",
        unit: "m",
        delta: "pct",
        read: (item) => numberOf(item.vehicle?.length),
      },
      {
        key: "width",
        labelKey: "width",
        unit: "m",
        delta: "pct",
        read: (item) => numberOf(item.vehicle?.width),
      },
      {
        key: "height",
        labelKey: "height",
        unit: "m",
        delta: "pct",
        read: (item) => numberOf(item.vehicle?.height),
      },
    ],
  },
  {
    key: "loadout",
    rows: [
      {
        key: "hardpoints",
        labelKey: "hardpoints",
        direction: 1,
        delta: "abs",
        read: (item) => countOf(item.vehicle?.hardpoints),
      },
      {
        key: "components",
        labelKey: "components",
        direction: 1,
        delta: "abs",
        read: (item) => countOf(item.vehicle?.components),
      },
    ],
  },
];

const WEAPON_GROUPS: GroupSpec[] = [
  {
    key: "damage",
    rows: [
      {
        key: "damageType",
        labelKey: "damageType",
        read: (item) => textOf(item.weapon?.damageType),
      },
      {
        key: "caliber",
        labelKey: "caliber",
        read: (item) => textOf(item.weapon?.caliber),
      },
    ],
  },
  {
    key: "rounds",
    rows: [
      {
        key: "rateOfFire",
        labelKey: "rateOfFire",
        direction: 1,
        delta: "pct",
        bar: true,
        read: (item) => numberOf(item.weapon?.rateOfFire),
      },
      {
        key: "magazine",
        labelKey: "magazine",
        direction: 1,
        delta: "abs",
        read: (item) => numberOf(item.weapon?.magazine),
      },
      {
        key: "reloadTime",
        labelKey: "reloadTime",
        unit: "s",
        direction: -1,
        delta: "pct",
        read: (item) => numberOf(item.weapon?.reloadTime),
      },
      {
        key: "fireModes",
        labelKey: "fireModes",
        read: (item) => {
          const modes = item.weapon?.fireModes;
          if (!modes?.length) return null;
          return modes.map((mode) => mode.label).join(" · ");
        },
      },
      {
        key: "weaponMass",
        labelKey: "mass",
        unit: "kg",
        direction: -1,
        delta: "pct",
        read: (item) => numberOf(item.weapon?.mass),
      },
    ],
  },
  {
    key: "ammunition",
    rows: [
      {
        key: "ammoSize",
        labelKey: "ammoSize",
        read: (item) => numberOf(item.weapon?.ammunition?.size),
      },
      {
        key: "ammoDamage",
        labelKey: "ammoDamage",
        direction: 1,
        delta: "pct",
        bar: true,
        read: (item) => numberOf(item.weapon?.ammunition?.damagePerShot),
      },
      {
        key: "ammoSpeed",
        labelKey: "ammoSpeed",
        unit: "m/s",
        direction: 1,
        delta: "pct",
        read: (item) => numberOf(item.weapon?.ammunition?.speed),
      },
      {
        key: "ammoRange",
        labelKey: "ammoRange",
        unit: "m",
        direction: 1,
        delta: "pct",
        bar: true,
        read: (item) => numberOf(item.weapon?.ammunition?.range),
      },
      {
        key: "ammoCapacity",
        labelKey: "ammoCapacity",
        direction: 1,
        delta: "abs",
        read: (item) => numberOf(item.weapon?.ammunition?.capacity),
      },
      {
        key: "ammoPenetration",
        labelKey: "ammoPenetration",
        direction: 1,
        delta: "pct",
        read: (item) => numberOf(item.weapon?.ammunition?.penetration),
      },
      {
        key: "falloffStart",
        labelKey: "falloffStart",
        unit: "m",
        direction: 1,
        delta: "pct",
        read: (item) => numberOf(item.weapon?.ammunition?.falloffStart),
      },
    ],
  },
  {
    key: "spread",
    rows: [
      {
        key: "adsSpreadMin",
        labelKey: "adsSpreadMin",
        unit: "°",
        direction: -1,
        delta: "pct",
        read: (item) => numberOf(item.weapon?.adsSpread?.min),
      },
      {
        key: "hipSpreadMin",
        labelKey: "hipSpreadMin",
        unit: "°",
        direction: -1,
        delta: "pct",
        read: (item) => numberOf(item.weapon?.spread?.min),
      },
      {
        key: "spreadDecay",
        labelKey: "spreadDecay",
        unit: "°/s",
        direction: 1,
        delta: "pct",
        read: (item) => numberOf(item.weapon?.spread?.decay),
      },
    ],
  },
];

const RESOURCE_GROUPS: GroupSpec[] = [
  {
    key: "handling",
    rows: [
      {
        key: "form",
        labelKey: "form",
        read: (item) => textOf(item.resource?.form),
      },
      {
        key: "volatile",
        labelKey: "volatile",
        translateValues: true,
        read: (item) => {
          if (item.resource?.volatile === undefined) return null;
          return item.resource.volatile ? "yes" : "no";
        },
      },
      {
        key: "unitVolumeScu",
        labelKey: "unitVolume",
        unit: "SCU",
        delta: "pct",
        read: (item) => numberOf(item.resource?.unitVolumeScu),
      },
      {
        key: "purityMax",
        labelKey: "purityMax",
        unit: "%",
        direction: 1,
        delta: "pct",
        read: (item) => numberOf(item.resource?.purityMax),
      },
    ],
  },
  {
    key: "market",
    rows: [
      {
        key: "marketsCount",
        labelKey: "marketsCount",
        direction: 1,
        delta: "abs",
        read: (item) =>
          item.resource?.markets ? item.resource.markets.length : null,
      },
      {
        key: "bestPrice",
        labelKey: "bestPrice",
        unit: "aUEC",
        direction: 1,
        delta: "pct",
        bar: true,
        read: (item) => {
          const prices = (item.resource?.markets ?? [])
            .filter((market) => market.side !== "sell")
            .map((market) => market.price)
            .filter(isNumber);
          return prices.length ? Math.max(...prices) : null;
        },
      },
    ],
  },
  {
    key: "refining",
    rows: [
      {
        key: "refiningYield",
        labelKey: "refiningYield",
        unit: "%",
        direction: 1,
        delta: "pct",
        bar: true,
        read: (item) => numberOf(item.resource?.refining?.yield),
      },
      {
        key: "refiningDuration",
        labelKey: "refiningDuration",
        unit: "s",
        direction: -1,
        delta: "pct",
        read: (item) => numberOf(item.resource?.refining?.durationSeconds),
      },
      {
        key: "refiningCost",
        labelKey: "refiningCost",
        unit: "aUEC",
        direction: -1,
        delta: "pct",
        read: (item) => numberOf(item.resource?.refining?.cost),
      },
    ],
  },
];

function groupsForKind(kind: Item["kind"]): GroupSpec[] {
  switch (kind) {
    case "vehicle":
      return VEHICLE_GROUPS;
    case "weapon":
      return WEAPON_GROUPS;
    case "resource":
      return RESOURCE_GROUPS;
    default:
      return [];
  }
}

/**
 * Le profil de tir n'a pas de champs fixes : chaque arme porte les
 * caractéristiques qu'un administrateur lui a saisies. On prend l'union des
 * libellés, dans l'ordre où la première arme les présente.
 */
function weaponProfileRows(items: Item[]): ComparisonRow[] {
  const labels: string[] = [];
  for (const item of items) {
    for (const stat of item.weapon?.profile ?? []) {
      if (!labels.includes(stat.label)) labels.push(stat.label);
    }
  }

  return labels.map((label) => ({
    key: `profile:${label}`,
    label,
    unit: items
      .flatMap((item) => item.weapon?.profile ?? [])
      .find((stat) => stat.label === label && stat.unit)?.unit,
    direction: 1,
    delta: "pct" as const,
    bar: true,
    values: items.map((item) => {
      const stat = item.weapon?.profile?.find((entry) => entry.label === label);
      return stat ? stat.value : null;
    }),
  }));
}

/** Même principe pour les statistiques libres, que tous les types portent. */
function statisticsRows(items: Item[]): ComparisonRow[] {
  const names: string[] = [];
  for (const item of items) {
    for (const name of Object.keys(item.statistics ?? ({} as ItemStatistics))) {
      if (!names.includes(name)) names.push(name);
    }
  }

  return names.map((name) => {
    const values = items.map((item) => item.statistics?.[name]?.value ?? null);
    const numeric = values.every((value) => value === null || isNumber(value));

    return {
      key: `stat:${name}`,
      label: name,
      unit: items.find((item) => item.statistics?.[name]?.unit)?.statistics?.[
        name
      ]?.unit,
      // Rien ne dit qu'une statistique saisie à la main se lit vers le haut :
      // on montre l'écart, jamais un gagnant.
      delta: numeric ? ("pct" as const) : undefined,
      values,
    };
  });
}

/** Une ligne que personne ne renseigne n'a rien à apprendre au lecteur. */
function hasAnyValue(row: ComparisonRow): boolean {
  return row.values.some((value) => value !== null);
}

export function buildComparisonGroups(items: Item[]): ComparisonGroup[] {
  if (items.length === 0) return [];

  const specs: GroupSpec[] = [IDENTITY, ...groupsForKind(items[0].kind)];

  const groups: ComparisonGroup[] = specs.map((group) => ({
    key: group.key,
    rows: group.rows
      .map(({ read, ...row }) => ({ ...row, values: items.map(read) }))
      .filter(hasAnyValue),
  }));

  if (items[0].kind === "weapon") {
    const profile = weaponProfileRows(items).filter(hasAnyValue);
    if (profile.length) {
      const damage = groups.find((group) => group.key === "damage");
      if (damage) damage.rows = [...damage.rows, ...profile];
      else groups.push({ key: "damage", rows: profile });
    }
  }

  const statistics = statisticsRows(items).filter(hasAnyValue);
  if (statistics.length) groups.push({ key: "statistics", rows: statistics });

  return groups.filter((group) => group.rows.length > 0);
}

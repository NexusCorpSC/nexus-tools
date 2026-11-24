/**
 * Publie les avant-postes extraits des fichiers du jeu, avec leurs plans.
 *
 *   npm run import:outposts -- <fichier.nexus.json> [options]
 *
 *   --dry-run        lit la base et dit ce qui changerait, sans rien écrire
 *   --offline        sans base ni blob storage : vérifie le fichier, mesure
 *                    les plans tels qu'ils seraient enregistrés
 *   --previews DIR   avec --offline : rend les aperçus PNG dans DIR
 *   --filter TEXTE   ne traite que les lieux dont le nom contient TEXTE
 *                    (ne supprime alors rien)
 *   --no-previews    n'envoie pas les aperçus (plus rapide, plans sans image)
 *
 * Le fichier vient de l'export hors ligne (`export_nexus.py`, sur le poste
 * qui lit le `Data.p4k`) : un corps, ses secteurs, ses groupes et ses
 * avant-postes, parents d'abord, chacun avec un identifiant stable tiré du jeu.
 * Ce ne sont que nos relevés : aucun fichier du jeu n'en fait partie.
 *
 * Les règles, décidées pour Nyx I :
 *   - Arborescence : corps › secteurs › groupes › avant-postes. Secteurs et
 *     groupes sont des lieux de type `region`.
 *   - Provenance `game-files` : relancer l'import met à jour les mêmes fiches.
 *     Le nom, le type et le parent suivent le jeu ; la description, l'image,
 *     les services et les astuces posés par quelqu'un restent.
 *   - Position : marquée `game-files`. Une position relevée par un joueur
 *     (sans cette marque) n'est jamais remplacée.
 *   - Plans : remplacés tant que personne ne les a retouchés, ce que dit
 *     l'empreinte `source.plansHash`. Un plan modifié à la main est gardé.
 *   - Un lieu importé que le jeu n'a plus est supprimé. Ce qu'il contenait et
 *     qui avait été créé à la main remonte à son parent.
 *
 * Après un import qui a remplacé ou supprimé des plans, les anciens aperçus
 * restent dans le blob storage : `npm run clean:blobs -- --apply` les retire.
 *
 * Demande `MONGODB_URI` et `BLOB_READ_WRITE_TOKEN`, sauf avec --offline.
 */

import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  DrawnPlacePlan,
  Place,
  PlacePlan,
  StoredPlacePlan,
} from "@/types/places";

// ─── Ligne de commande ────────────────────────────────────────────────────────

type Options = {
  file: string;
  dryRun: boolean;
  offline: boolean;
  previews?: string;
  filter?: string;
  uploadPreviews: boolean;
};

function parseArgs(argv: string[]): Options {
  const fail = (message: string): never => {
    console.error(message);
    console.error(
      "Usage : npm run import:outposts -- <fichier.nexus.json> [--dry-run] [--offline [--previews DIR]] [--filter TEXTE] [--no-previews]",
    );
    process.exit(1);
  };

  let file: string | undefined;
  const options: Omit<Options, "file"> = {
    dryRun: false,
    offline: false,
    uploadPreviews: true,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => argv[++i] ?? fail(`${arg} attend une valeur`);
    if (arg === "--dry-run") options.dryRun = true;
    else if (arg === "--offline") options.offline = true;
    else if (arg === "--previews") options.previews = next();
    else if (arg === "--filter") options.filter = next().toLowerCase();
    else if (arg === "--no-previews") options.uploadPreviews = false;
    else if (arg.startsWith("--")) fail(`Option inconnue : ${arg}`);
    else if (!file) file = arg;
    else fail(`Argument en trop : ${arg}`);
  }
  if (!file) fail("Il manque le fichier à importer");
  if (options.previews && !options.offline) {
    fail("--previews ne sert qu'avec --offline");
  }
  return { file: file as string, ...options };
}

// ─── Le fichier ───────────────────────────────────────────────────────────────

type ExportPlace = {
  id: string;
  name: string;
  type: "region" | "outpost";
  parent: string | null;
  kind?: string;
  template?: string;
  position?: { x: number; y: number; z: number };
  plans?: unknown[];
};

type ExportFile = {
  format: number;
  build: string;
  body: string;
  places: ExportPlace[];
};

function readExport(raw: string): ExportFile {
  const data = JSON.parse(raw) as Partial<ExportFile>;
  if (data.format !== 1) {
    throw new Error(
      `Format ${data.format} inconnu : ce script lit le format 1`,
    );
  }
  if (!data.body || !data.build || !Array.isArray(data.places)) {
    throw new Error("Le fichier doit porter body, build et places");
  }

  const seen = new Set<string>();
  for (const place of data.places) {
    if (!place.id || !place.name) {
      throw new Error(
        `Lieu sans identifiant ou sans nom : ${JSON.stringify(place).slice(0, 120)}`,
      );
    }
    if (place.type !== "region" && place.type !== "outpost") {
      throw new Error(`${place.name} : type « ${place.type} » inattendu`);
    }
    if (seen.has(place.id))
      throw new Error(`Identifiant en double : ${place.id}`);
    // Parents d'abord : c'est ce qui permet de tout créer en une passe.
    if (place.parent !== null && !seen.has(place.parent)) {
      throw new Error(
        `${place.name} : son parent ${place.parent} n'apparaît pas avant lui`,
      );
    }
    seen.add(place.id);
  }
  return data as ExportFile;
}

/** Ce qu'une fiche dit d'elle-même tant que personne n'a écrit mieux. */
function describe(
  place: ExportPlace,
  byId: Map<string, ExportPlace>,
  bodyName: string,
  build: string,
): string {
  const chain: string[] = [];
  for (let id = place.parent; id; id = byId.get(id)?.parent ?? null) {
    const parent = byId.get(id);
    if (parent) chain.unshift(parent.name);
  }
  const where = [bodyName, ...chain].join(" › ");
  if (place.type === "region") {
    return place.kind === "cluster"
      ? `Groupe d'avant-postes de ${where}.`
      : `Secteur de ${where}.`;
  }
  return `Avant-poste de ${where}. Position et plan extraits des fichiers du jeu (${build}) : le plan montre l'agencement, pas ce qu'on trouve sur place.`;
}

// ─── Plans ────────────────────────────────────────────────────────────────────

function isOwned(plan: StoredPlacePlan): plan is PlacePlan {
  return !("sourceSlug" in plan);
}

/**
 * L'empreinte des plans possédés, aperçu exclu : l'aperçu change d'adresse à
 * chaque rendu sans que le relevé ait bougé.
 */
function plansHash(plans: StoredPlacePlan[]): string {
  const bare = plans
    .filter(isOwned)
    .map((plan) => ({ ...plan, preview: undefined }));
  return createHash("sha1")
    .update(JSON.stringify(bare))
    .digest("hex")
    .slice(0, 16);
}

/** Ce que le normaliseur a laissé tomber d'un plan, pour le rapport. */
function losses(raw: unknown, kept: DrawnPlacePlan): string[] {
  const plan = raw as Partial<DrawnPlacePlan>;
  const out: string[] = [];
  const levels = Array.isArray(plan.levels) ? plan.levels : [];
  if (levels.length > kept.levels.length) {
    out.push(`${levels.length - kept.levels.length} niveau(x)`);
  }
  levels.slice(0, kept.levels.length).forEach((level, index) => {
    const after = kept.levels[index];
    for (const key of ["rooms", "walls", "doors"] as const) {
      const before = Array.isArray(level[key]) ? level[key].length : 0;
      if (before > after[key].length) {
        out.push(`${after.name} : ${before - after[key].length} ${key}`);
      }
    }
  });
  const markers = Array.isArray(plan.markers) ? plan.markers.length : 0;
  if (markers > kept.markers.length) {
    out.push(`${markers - kept.markers.length} repère(s)`);
  }
  return out;
}

// ─── Rapport ──────────────────────────────────────────────────────────────────

type Report = {
  created: number;
  updated: number;
  plansWritten: number;
  plansKept: number;
  positionsKept: number;
  deleted: number;
  failed: number;
  warnings: string[];
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function kb(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / 1024 / 1024).toFixed(1)} Mo`
    : `${(bytes / 1024).toFixed(1)} Ko`;
}

// ─── Hors ligne ───────────────────────────────────────────────────────────────

async function runOffline(data: ExportFile, options: Options): Promise<number> {
  // `lib/places` charge le client Mongo, qui ne se connecte qu'à la première
  // requête : une adresse factice suffit pour se servir du normaliseur.
  process.env.MONGODB_URI ??= "mongodb://127.0.0.1:1/offline";
  const { normalizePlacePlan, normalizePlaceInput } =
    await import("@/lib/places");
  const preview = options.previews ? await import("@/lib/plan-preview") : null;
  if (options.previews) await mkdir(options.previews, { recursive: true });

  const sizes: number[] = [];
  let plans = 0;
  let truncated = 0;
  let failed = 0;
  const pngSizes: number[] = [];

  for (const place of data.places) {
    if (options.filter && !place.name.toLowerCase().includes(options.filter))
      continue;
    try {
      normalizePlaceInput({
        name: place.name,
        type: place.type,
        source: { name: "game-files", id: place.id },
        position: place.position
          ? { body: data.body, ...place.position }
          : undefined,
      });
    } catch (error) {
      failed += 1;
      console.error(`✗ ${place.name} : ${(error as Error).message}`);
      continue;
    }

    const stored: StoredPlacePlan[] = [];
    for (const raw of place.plans ?? []) {
      const plan = normalizePlacePlan(raw, "offline");
      if (!plan || plan.kind !== "drawn") {
        failed += 1;
        console.error(`✗ ${place.name} : un plan illisible`);
        continue;
      }
      plans += 1;
      const lost = losses(raw, plan);
      if (lost.length) {
        truncated += 1;
        console.warn(
          `! ${place.name} / ${plan.name} : tronqué (${lost.join(", ")})`,
        );
      }
      stored.push(plan);

      if (preview && options.previews) {
        const plate = await preview.renderPlatePng(
          plan,
          preview.previewOptions(plan, place.name),
        );
        const file = path.join(
          options.previews,
          `${place.id.replace(/[^a-z0-9-]+/gi, "_")}-${plan.id}.png`,
        );
        await writeFile(file, plate.png);
        pngSizes.push(plate.png.length);
      }
    }
    if (stored.length) sizes.push(Buffer.byteLength(JSON.stringify(stored)));
  }

  const total = sizes.reduce((sum, size) => sum + size, 0);
  console.log(
    `\n${data.places.length} lieu(x), ${plans} plan(s), ${truncated} tronqué(s), ${failed} erreur(s).`,
  );
  console.log(
    `Plans en base : ${kb(total)} au total, ${kb(median(sizes))} en médiane par lieu.`,
  );
  if (pngSizes.length) {
    const pngTotal = pngSizes.reduce((sum, size) => sum + size, 0);
    console.log(
      `Aperçus : ${pngSizes.length} PNG, ${kb(pngTotal)} au total, ${kb(median(pngSizes))} en médiane.`,
    );
  }
  return failed > 0 ? 2 : 0;
}

// ─── En ligne ─────────────────────────────────────────────────────────────────

async function runOnline(data: ExportFile, options: Options): Promise<number> {
  const { default: db } = await import("@/lib/db");
  const places = await import("@/lib/places");
  const { uploadPlanPreview } = await import("@/lib/plan-preview");
  const collection = db.db().collection<Place>("gameLocations");

  const report: Report = {
    created: 0,
    updated: 0,
    plansWritten: 0,
    plansKept: 0,
    positionsKept: 0,
    deleted: 0,
    failed: 0,
    warnings: [],
  };

  try {
    const body = await places.getPlaceBySlug(data.body);
    if (!body)
      throw new Error(
        `Le corps « ${data.body} » n'existe pas dans le catalogue`,
      );

    const byId = new Map(data.places.map((place) => [place.id, place]));
    const slugById = new Map<string, string>();

    // Les lieux déjà importés de ce fichier, pour les retrouver sans requête
    // par lieu et pour savoir ce qui a disparu.
    const previous = await collection
      .find({ "source.name": "game-files", ancestorSlugs: data.body })
      .project<Place>({ _id: 0 })
      .toArray();
    const previousById = new Map(
      previous.map((place) => [place.source!.id, place]),
    );

    for (const place of data.places) {
      const wanted =
        !options.filter || place.name.toLowerCase().includes(options.filter);
      const existing = previousById.get(place.id);
      if (!wanted) {
        // Hors filtre : on ne le touche pas, mais ses enfants doivent savoir
        // où se ranger.
        if (existing) slugById.set(place.id, existing.slug);
        continue;
      }

      const parentSlug = place.parent ? slugById.get(place.parent) : data.body;
      if (!parentSlug) {
        report.failed += 1;
        console.error(`✗ ${place.name} : parent ${place.parent} introuvable`);
        continue;
      }

      // Une position relevée en jeu par un joueur vaut mieux que la nôtre.
      const keepPosition =
        existing?.position && existing.position.source !== "game-files";
      if (keepPosition) report.positionsKept += 1;
      const position =
        place.position && !keepPosition
          ? { body: data.body, ...place.position }
          : undefined;

      if (options.dryRun) {
        if (existing) report.updated += 1;
        else report.created += 1;
        slugById.set(
          place.id,
          existing?.slug ??
            places.normalizePlaceInput({ name: place.name, type: place.type })
              .slug,
        );
        const owned = (existing?.plans ?? []).filter(isOwned);
        if (
          !existing ||
          owned.length === 0 ||
          plansHash(existing.plans ?? []) === existing.source?.plansHash
        ) {
          report.plansWritten += place.plans?.length ?? 0;
        } else {
          report.plansKept += 1;
        }
        continue;
      }

      try {
        const { action, place: saved } = await places.upsertImportedPlace(
          {
            name: place.name,
            type: place.type,
            parentSlug,
            description: describe(place, byId, body.name, data.build),
            source: { name: "game-files", id: place.id },
            ...(position ? { position } : {}),
          },
          { update: true, slugFallbacks: [body.slug] },
        );
        slugById.set(place.id, saved.slug);
        if (action === "created") report.created += 1;
        else report.updated += 1;

        if (position) {
          // `normalizePlacePosition` ne garde pas la marque : on la pose ici,
          // comme `import:star-map`.
          await collection.updateOne(
            { slug: saved.slug },
            { $set: { "position.source": "game-files" } },
          );
        }

        await writePlans(place, saved);
      } catch (error) {
        report.failed += 1;
        console.error(`✗ ${place.name} : ${(error as Error).message}`);
      }
    }

    async function writePlans(place: ExportPlace, saved: Place) {
      const current = saved.plans ?? [];
      const untouched =
        current.filter(isOwned).length === 0 ||
        plansHash(current) === saved.source?.plansHash;
      if (!untouched) {
        report.plansKept += 1;
        return;
      }

      const next: StoredPlacePlan[] = [];
      for (const raw of place.plans ?? []) {
        const plan = places.normalizePlacePlan(raw, saved.slug);
        if (!plan || plan.kind !== "drawn") {
          report.warnings.push(`${place.name} : un plan illisible, ignoré`);
          continue;
        }
        const lost = losses(raw, plan);
        if (lost.length)
          report.warnings.push(
            `${place.name} / ${plan.name} : tronqué (${lost.join(", ")})`,
          );
        if (options.uploadPreviews) {
          try {
            const preview = await uploadPlanPreview(
              plan,
              saved.slug,
              saved.name,
            );
            if (preview) plan.preview = preview;
          } catch (error) {
            // Comme dans l'éditeur : un rendu raté coûte l'aperçu, pas le relevé.
            report.warnings.push(
              `${place.name} / ${plan.name} : aperçu non rendu (${(error as Error).message})`,
            );
          }
        }
        next.push(plan);
      }
      // Les emprunts qu'on aurait posés à la main restent.
      next.push(...current.filter((plan) => !isOwned(plan)));

      if (next.length === 0 && current.length === 0) return;
      const updated = await places.savePlacePlans(saved.slug, next);
      await collection.updateOne(
        { slug: saved.slug },
        { $set: { "source.plansHash": plansHash(updated.plans ?? []) } },
      );
      report.plansWritten += next.filter(isOwned).length;
    }

    // Ce que le jeu n'a plus. Seulement sur un import complet : avec un
    // filtre, l'absence d'un lieu ne dit rien.
    if (!options.filter) {
      const gone = previous
        .filter((place) => !byId.has(place.source!.id))
        // Les plus profonds d'abord : un parent n'est vide qu'après ses enfants.
        .sort(
          (a, b) =>
            (b.ancestorSlugs?.length ?? 0) - (a.ancestorSlugs?.length ?? 0),
        );

      for (const place of gone) {
        if (options.dryRun) {
          report.deleted += 1;
          continue;
        }
        try {
          // Ce qu'un joueur ou un administrateur y avait rangé remonte d'un cran.
          const adopted = await collection.updateMany(
            {
              parentSlug: place.slug,
              privacy: { $exists: false },
              "source.name": { $ne: "game-files" },
            },
            { $set: { parentSlug: place.parentSlug } },
          );
          if (adopted.modifiedCount > 0) {
            report.warnings.push(
              `${place.name} : ${adopted.modifiedCount} lieu(x) créé(s) à la main remonté(s) dans ${place.parentSlug}`,
            );
          }
          if (await places.deletePlace(place.slug)) report.deleted += 1;
        } catch (error) {
          report.failed += 1;
          console.error(
            `✗ suppression de ${place.name} : ${(error as Error).message}`,
          );
        }
      }
    }

    for (const warning of report.warnings) console.warn(`! ${warning}`);
    console.log(
      `\n${options.dryRun ? "Essai à blanc, rien écrit. " : ""}${report.created} créé(s), ${report.updated} mis à jour, ${report.deleted} supprimé(s), ${report.failed} en erreur.`,
    );
    console.log(
      `Plans : ${report.plansWritten} écrit(s), ${report.plansKept} lieu(x) aux plans retouchés à la main gardés. Positions de joueurs gardées : ${report.positionsKept}.`,
    );

    if (!options.dryRun) {
      const changed = await places.recomputeAllPlaces();
      console.log(`Champs dérivés recalculés : ${changed} lieu(x) mis à jour.`);
      if (report.deleted > 0 || report.updated > 0) {
        console.log(
          "Les anciens aperçus restent dans le blob storage : npm run clean:blobs -- --apply",
        );
      }
    }
  } finally {
    await db.close();
  }
  return report.failed > 0 ? 2 : 0;
}

// ─── Entrée ───────────────────────────────────────────────────────────────────

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const data = readExport(await readFile(options.file, "utf8"));
  console.log(
    `${path.basename(options.file)} : ${data.places.length} lieu(x) de ${data.body}, build ${data.build}.`,
  );
  process.exitCode = options.offline
    ? await runOffline(data, options)
    : await runOnline(data, options);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

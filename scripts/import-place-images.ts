/**
 * Va chercher une photo de couverture pour les lieux du catalogue.
 *
 *   npm run import:place-images -- [options]
 *
 *   --force        reprendre aussi les lieux qui ont déjà une image
 *   --mirror       recopier les images dans le blob storage plutôt que de
 *                  pointer vers la source (BLOB_READ_WRITE_TOKEN requis)
 *   --limit N      ne traiter que les N premiers lieux
 *   --filter TEXTE ne garder que les lieux dont le nom contient TEXTE
 *   --dry-run      tout calculer, n'écrire nulle part
 *
 * La source est le Star Citizen Wiki (starcitizen.tools), déjà utilisé par
 * l'import du catalogue d'objets et déjà autorisé dans `next.config.ts`. On
 * demande l'illustration principale de la page qui porte le nom du lieu.
 *
 * Un nom ne tombe pas toujours juste du premier coup : le wiki écrit les
 * apostrophes en ASCII, distingue la planète ArcCorp de l'entreprise du même
 * nom, et le dump dont vient la graine a parfois mangé une espace. On essaie
 * donc une courte échelle de titres, la plus fidèle d'abord, et on s'arrête au
 * premier qui répond — la même idée que l'échelle de slugs de
 * `upsertImportedItem`.
 *
 * Les images vectorielles sont écartées : plusieurs magasins n'ont que leur
 * logo en SVG, et l'optimiseur d'images de Next refuse le SVG distant tant que
 * `dangerouslyAllowSVG` n'est pas posé — ce qu'on ne va pas faire pour des
 * vignettes. Ces lieux gardent l'initiale de leur nom, ce que le composant
 * d'illustration sait déjà afficher.
 *
 * Chaque redirection suivie est imprimée : c'est ce qui permet de vérifier
 * d'un coup d'œil qu'aucune page n'a été prise pour une autre.
 */

import { put } from "@vercel/blob";
import db from "@/lib/db";
import { setPlaceImage } from "@/lib/places";
import type { Place } from "@/types/places";

// ─── Ligne de commande ────────────────────────────────────────────────────────

type Options = {
  force: boolean;
  mirror: boolean;
  limit?: number;
  filter?: string;
  dryRun: boolean;
};

function parseArgs(argv: string[]): Options {
  const options: Options = { force: false, mirror: false, dryRun: false };

  const fail = (message: string): never => {
    console.error(message);
    process.exit(1);
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    // Une option à valeur qui n'en trouve pas s'arrête ici. La laisser passer
    // en `undefined` ferait qu'une faute de frappe sur `--limit` traiterait
    // tout le catalogue en silence, ce qui est précisément ce dont on se
    // protégeait en tapant `--limit`.
    const next = () => argv[++i] ?? fail(`${arg} attend une valeur`);

    if (arg === "--force") options.force = true;
    else if (arg === "--mirror") options.mirror = true;
    else if (arg === "--limit") {
      const limit = Number(next());
      if (!Number.isInteger(limit) || limit < 1) {
        fail("--limit attend un entier positif");
      }
      options.limit = limit;
    } else if (arg === "--filter") options.filter = next().toLowerCase();
    else if (arg === "--dry-run") options.dryRun = true;
    else fail(`Option inconnue : ${arg}`);
  }

  return options;
}

// ─── Le wiki ──────────────────────────────────────────────────────────────────

const WIKI_API = "https://starcitizen.tools/api.php";
const USER_AGENT = "nexus-tools-import/0.1 (+https://tools.services.nexus)";

/** Le maximum qu'accepte l'API pour un anonyme est 50 ; on reste en dessous. */
const BATCH = 40;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

type WikiPage = {
  title: string;
  missing?: string;
  thumbnail?: { source: string };
  original?: { source: string };
};

type WikiAnswer = {
  query?: {
    normalized?: { from: string; to: string }[];
    redirects?: { from: string; to: string }[];
    pages?: Record<string, WikiPage>;
  };
};

function isVector(url: string): boolean {
  return /\.svgz?(\?|$)/i.test(url);
}

/** La vignette d'abord : elle est bornée en largeur et servie en webp. */
function pickImage(page: WikiPage): string | undefined {
  return [page.thumbnail?.source, page.original?.source]
    .filter((url): url is string => !!url)
    .find((url) => !isVector(url));
}

type Lookup = {
  /** Le titre servi, une fois les normalisations et redirections suivies. */
  title: string;
  image?: string;
  /** Vrai quand la page existe mais n'a que du vectoriel à offrir. */
  vectorOnly: boolean;
};

/** Interroge le wiki pour un lot de titres, et rend ce qu'il a répondu. */
async function askWiki(titles: string[]): Promise<Map<string, Lookup>> {
  const url =
    `${WIKI_API}?action=query&format=json&redirects=1` +
    `&prop=pageimages&piprop=thumbnail%7Coriginal&pithumbsize=1200` +
    `&titles=${encodeURIComponent(titles.join("|"))}`;

  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) {
    throw new Error(`wiki ${response.status} — ${titles.length} titre(s)`);
  }
  const data = (await response.json()) as WikiAnswer;
  const query = data.query ?? {};

  // Le wiki dit lui-même ce qu'il a fait du titre demandé : une normalisation
  // de casse ou de ponctuation, puis éventuellement une redirection.
  const hops = new Map<string, string>();
  for (const hop of [...(query.normalized ?? []), ...(query.redirects ?? [])]) {
    hops.set(hop.from, hop.to);
  }
  const resolve = (title: string) => {
    let current = title;
    for (let step = 0; hops.has(current) && step < 5; step++) {
      current = hops.get(current)!;
    }
    return current;
  };

  const byTitle = new Map(
    Object.values(query.pages ?? {}).map((page) => [page.title, page]),
  );

  const answers = new Map<string, Lookup>();
  for (const title of titles) {
    const served = resolve(title);
    const page = byTitle.get(served);
    if (!page || page.missing !== undefined) continue;

    const image = pickImage(page);
    answers.set(title, {
      title: served,
      image,
      vectorOnly: !image && !!(page.thumbnail ?? page.original),
    });
  }

  return answers;
}

// ─── L'échelle de titres ──────────────────────────────────────────────────────

/**
 * Les titres à essayer pour un lieu, du plus fidèle au plus permissif. Aucun
 * n'invente de nom : ce sont des variantes d'écriture du même, plus la
 * désambiguïsation que le wiki emploie pour les corps qui partagent leur nom
 * avec une entreprise — ArcCorp, microTech.
 */
function candidateTitles(place: Pick<Place, "name" | "type">): string[] {
  const titles = [place.name];

  const ascii = place.name.replace(/[’‘]/g, "'");
  if (ascii !== place.name) titles.push(ascii);

  // « ArcCorp Mining Area157 » dans le dump, « … Area 157 » sur le wiki.
  const spaced = ascii.replace(/([A-Za-z])(\d+)$/, "$1 $2");
  if (spaced !== ascii) titles.push(spaced);

  if (place.type === "planet" || place.type === "moon") {
    titles.push(`${ascii} (${place.type})`);
  }

  return [...new Set(titles)];
}

// ─── Le blob ──────────────────────────────────────────────────────────────────

/** Recopie l'image là où la route de téléversement l'attendrait. */
async function mirrorImage(url: string, slug: string): Promise<string> {
  const response = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!response.ok) throw new Error(`image ${response.status} — ${url}`);

  // « image/webp; charset=utf-8 » est un content-type valide : sans couper au
  // point-virgule, le fichier finirait nommé .jpg et le blob se verrait poser
  // un type qui traîne un charset.
  const contentType = (response.headers.get("content-type") ?? "image/jpeg")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const extension =
    { "image/png": "png", "image/webp": "webp", "image/jpeg": "jpg" }[
      contentType
    ] ?? "jpg";

  const blob = await put(
    `lieux/${slug}/image.${extension}`,
    Buffer.from(await response.arrayBuffer()),
    {
      access: "public",
      contentType,
      addRandomSuffix: false,
      allowOverwrite: true,
    },
  );
  return blob.url;
}

// ─── Programme ────────────────────────────────────────────────────────────────

type Report = {
  found: number;
  vector: number;
  missing: number;
  failed: number;
};

type Target = Pick<Place, "slug" | "name" | "type">;

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report: Report = { found: 0, vector: 0, missing: 0, failed: 0 };

  const filter = options.force ? {} : { imageUrl: { $exists: false } };
  let places = (await db
    .db()
    .collection<Place>("gameLocations")
    .find(filter, { projection: { _id: 0, slug: 1, name: 1, type: 1 } })
    .sort({ name: 1 })
    .toArray()) as Target[];

  if (options.filter) {
    const needle = options.filter;
    places = places.filter((place) =>
      place.name.toLowerCase().includes(needle),
    );
  }
  if (options.limit !== undefined) places = places.slice(0, options.limit);

  console.log(`${places.length} lieu(x) sans couverture à chercher`);
  if (places.length === 0) {
    await db.close();
    return;
  }

  // Une passe par échelon : on demande le premier titre pour tout le monde,
  // puis le suivant aux seuls lieux encore bredouilles. Chaque passe est
  // groupée, donc une poignée de requêtes suffit pour tout le catalogue.
  const ladders = new Map(
    places.map((place) => [place.slug, candidateTitles(place)] as const),
  );
  const resolved = new Map<string, Lookup>();
  const vectorOnly = new Set<string>();
  const depth = Math.max(...[...ladders.values()].map((list) => list.length));

  for (let rung = 0; rung < depth; rung++) {
    const pending = places.filter(
      (place) => !resolved.has(place.slug) && ladders.get(place.slug)![rung],
    );
    if (pending.length === 0) continue;

    for (let i = 0; i < pending.length; i += BATCH) {
      const slice = pending.slice(i, i + BATCH);
      const titles = slice.map((place) => ladders.get(place.slug)![rung]);

      try {
        const answers = await askWiki([...new Set(titles)]);
        for (const place of slice) {
          const answer = answers.get(ladders.get(place.slug)![rung]);
          if (!answer) continue;
          if (answer.image) resolved.set(place.slug, answer);
          else if (answer.vectorOnly) vectorOnly.add(place.slug);
        }
      } catch (error) {
        report.failed += slice.length;
        console.error(
          `  ! lot de ${slice.length} : ${(error as Error).message}`,
        );
      }

      await sleep(300);
    }
  }

  for (const place of places) {
    const answer = resolved.get(place.slug);

    if (!answer) {
      if (vectorOnly.has(place.slug)) {
        report.vector++;
        console.log(`  ~ ${place.name}  (logo vectoriel, écarté)`);
      } else {
        report.missing++;
        console.log(`  = ${place.name}  (aucune page illustrée)`);
      }
      continue;
    }

    const via = answer.title === place.name ? "" : `  via « ${answer.title} »`;

    if (options.dryRun) {
      console.log(`  · ${place.name}${via}`);
      report.found++;
      continue;
    }

    try {
      const imageUrl = options.mirror
        ? await mirrorImage(answer.image!, place.slug)
        : answer.image!;
      const written = await setPlaceImage(place.slug, imageUrl);
      if (!written) throw new Error("lieu introuvable à l'écriture");

      report.found++;
      console.log(`  + ${place.name}${via}  → /lieux/${place.slug}`);
    } catch (error) {
      report.failed++;
      console.error(`  ! ${place.name} : ${(error as Error).message}`);
    }
  }

  console.log(
    options.dryRun
      ? `\nRien écrit : --dry-run. ${report.found} couverture(s) trouvée(s), ${report.vector} logo(s) vectoriel(s) écarté(s), ${report.missing} sans page illustrée.`
      : `\nTerminé : ${report.found} couverture(s) posée(s), ${report.vector} logo(s) vectoriel(s) écarté(s), ${report.missing} sans page illustrée, ${report.failed} en erreur.`,
  );

  await db.close();
  process.exitCode = report.failed > 0 ? 2 : 0;
}

main().catch(async (error) => {
  console.error(error);
  await db.close().catch(() => {});
  process.exit(1);
});

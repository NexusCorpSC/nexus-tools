/**
 * Les illustrations des blueprints qui n'en ont pas.
 *
 * Deux sources, la plus sûre d'abord :
 *   - l'objet du catalogue que le blueprint fabrique, retrouvé par
 *     l'identifiant d'entité du jeu (`productEntityClass` = `source.id` des
 *     objets importés du wiki) : c'est le même objet, son image est la bonne ;
 *   - sinon la page du même nom sur starcitizen.tools, lue par l'API
 *     MediaWiki (50 titres par requête, redirections suivies) plutôt qu'en
 *     cherchant une balise dans le HTML de chaque page.
 *
 * Un nom porté par plusieurs blueprints (quatre « Cryo-Star SL ») ne passe
 * pas par le wiki : sa page ne montre qu'un seul des objets.
 */

import type { BlueprintDoc } from "./plan";
import { newReport, note, type Report } from "./plan";

const WIKI_API = "https://starcitizen.tools/api.php";
const USER_AGENT = "nexus-tools-import/0.1 (+https://tools.services.nexus)";
const TITLES_PER_REQUEST = 50;
/** Assez pour une fiche, sans les originaux en 4K. */
const THUMBNAIL_WIDTH = 1200;

/** L'image par défaut du wiki, qui n'illustre rien. */
const PLACEHOLDER = /Placeholderv2|sitelogo/i;

export type ImageChoice = {
  doc: BlueprintDoc;
  url: string;
  from: "catalogue" | "wiki";
};

type WikiQuery = {
  query?: {
    normalized?: { from: string; to: string }[];
    redirects?: { from: string; to: string }[];
    pages?: {
      title: string;
      missing?: boolean;
      thumbnail?: { source: string };
    }[];
  };
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function queryWiki(titles: string[], attempts = 4): Promise<WikiQuery> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    formatversion: "2",
    redirects: "1",
    prop: "pageimages",
    piprop: "thumbnail",
    pithumbsize: String(THUMBNAIL_WIDTH),
    titles: titles.join("|"),
  });
  for (let attempt = 1; ; attempt++) {
    try {
      const response = await fetch(`${WIKI_API}?${params}`, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(60_000),
      });
      if (response.ok) return (await response.json()) as WikiQuery;
      if (response.status !== 429 && response.status < 500) {
        throw new Error(`starcitizen.tools ${response.status}`);
      }
    } catch (error) {
      if (attempt >= attempts) throw error;
    }
    if (attempt >= attempts) throw new Error("starcitizen.tools injoignable");
    await sleep(2000 * attempt);
  }
}

/** L'image de la page de chaque titre, en suivant normalisation et redirections. */
async function wikiImages(titles: string[]): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (let i = 0; i < titles.length; i += TITLES_PER_REQUEST) {
    const batch = titles.slice(i, i + TITLES_PER_REQUEST);
    const { query } = await queryWiki(batch);
    const hop = new Map<string, string>();
    for (const step of [
      ...(query?.normalized ?? []),
      ...(query?.redirects ?? []),
    ]) {
      hop.set(step.from, step.to);
    }
    const pages = new Map(
      (query?.pages ?? [])
        .filter((page) => !page.missing && page.thumbnail?.source)
        .map((page) => [page.title, page.thumbnail!.source]),
    );
    for (const title of batch) {
      let current = title;
      for (let guard = 0; guard < 3 && hop.has(current); guard++) {
        current = hop.get(current)!;
      }
      const image = pages.get(current);
      if (image && !PLACEHOLDER.test(image)) found.set(title, image);
    }
  }
  return found;
}

export async function planBlueprintImages(
  docs: BlueprintDoc[],
  catalogueImages: Map<string, string>,
): Promise<{ choices: ImageChoice[]; report: Report }> {
  const report = newReport();
  const choices: ImageChoice[] = [];

  const sharedNames = new Map<string, number>();
  for (const doc of docs) {
    const name = doc.gameName ?? doc.name;
    sharedNames.set(name, (sharedNames.get(name) ?? 0) + 1);
  }

  const toWiki: BlueprintDoc[] = [];
  for (const doc of docs) {
    const fromCatalogue = doc.productEntityClass
      ? catalogueImages.get(doc.productEntityClass)
      : undefined;
    if (fromCatalogue) {
      choices.push({ doc, url: fromCatalogue, from: "catalogue" });
      note(report, "depuis l'objet du catalogue");
      continue;
    }
    const name = doc.gameName ?? doc.name;
    // `#`, `|`, `[`… ne peuvent pas figurer dans un titre de page.
    if ((sharedNames.get(name) ?? 0) > 1 || /[#<>[\]{}|]/.test(name)) {
      note(report, "sans image (nom ambigu ou impossible au wiki)", name);
      continue;
    }
    toWiki.push(doc);
  }

  const images = await wikiImages([
    ...new Set(toWiki.map((doc) => doc.gameName ?? doc.name)),
  ]);
  for (const doc of toWiki) {
    const url = images.get(doc.gameName ?? doc.name);
    if (url) {
      choices.push({ doc, url, from: "wiki" });
      note(report, "depuis starcitizen.tools");
    } else {
      note(
        report,
        "sans image (pas de page au wiki)",
        doc.gameName ?? doc.name,
      );
    }
  }

  return { choices, report };
}

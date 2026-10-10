import { inflateSync } from "node:zlib";

/**
 * Une police WOFF (1.0) rendue à sa forme TrueType/OpenType d'origine.
 *
 * Le rastériseur côté serveur (`@resvg/resvg-js`, pour l'aperçu des plans
 * dessinés par le serveur MCP) ne lit pas le WOFF, et le dépôt n'a la police
 * de l'interface qu'en WOFF (`app/fonts`). Le format n'est qu'un emballage :
 * chaque table, compressée en zlib ou non, se recopie telle quelle derrière un
 * en-tête sfnt.
 */
export function woffToSfnt(woff: Buffer): Buffer {
  if (woff.toString("ascii", 0, 4) !== "wOFF") {
    throw new Error("Not a WOFF 1.0 font");
  }
  const flavor = woff.readUInt32BE(4);
  const numTables = woff.readUInt16BE(12);

  type Table = { tag: number; checksum: number; data: Buffer };
  const tables: Table[] = [];
  for (let index = 0; index < numTables; index += 1) {
    const at = 44 + index * 20;
    const tag = woff.readUInt32BE(at);
    const offset = woff.readUInt32BE(at + 4);
    const compLength = woff.readUInt32BE(at + 8);
    const origLength = woff.readUInt32BE(at + 12);
    const checksum = woff.readUInt32BE(at + 16);
    const raw = woff.subarray(offset, offset + compLength);
    const data = compLength < origLength ? inflateSync(raw) : Buffer.from(raw);
    tables.push({ tag, checksum, data });
  }

  // L'en-tête sfnt : les champs de recherche binaire découlent du nombre de tables.
  let power = 1;
  let log = 0;
  while (power * 2 <= numTables) {
    power *= 2;
    log += 1;
  }
  const header = Buffer.alloc(12 + numTables * 16);
  header.writeUInt32BE(flavor, 0);
  header.writeUInt16BE(numTables, 4);
  header.writeUInt16BE(power * 16, 6);
  header.writeUInt16BE(log, 8);
  header.writeUInt16BE(numTables * 16 - power * 16, 10);

  const chunks: Buffer[] = [header];
  let offset = header.length;
  tables.forEach((table, index) => {
    const at = 12 + index * 16;
    header.writeUInt32BE(table.tag, at);
    header.writeUInt32BE(table.checksum, at + 4);
    header.writeUInt32BE(offset, at + 8);
    header.writeUInt32BE(table.data.length, at + 12);
    const padding = (4 - (table.data.length % 4)) % 4;
    chunks.push(table.data, Buffer.alloc(padding));
    offset += table.data.length + padding;
  });
  return Buffer.concat(chunks);
}

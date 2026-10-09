/**
 * Les quelques documents que `npm run mcp:smoke` interroge, pour une base
 * locale vide. Refuse toute base qui n'est pas sur cette machine.
 *
 *   npm run mcp:smoke:seed
 *   MCP_SMOKE_SELLER_EMAIL=… → ce compte vend dans « Smoke Shop 2 », pour
 *   les outils vendeur de la marketplace
 */
import { MongoClient, ObjectId } from "mongodb";

const uri = process.env.MONGODB_URI ?? "";
if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)[:/]/.test(uri)) {
  console.error("Refusé : MONGODB_URI doit pointer vers une base locale.");
  process.exit(1);
}

const now = new Date().toISOString();
const ownerId = new ObjectId("65f000000000000000000001");

const place = (slug: string, name: string, extra: Record<string, unknown>) => ({
  id: slug,
  slug,
  name,
  ancestorSlugs: [],
  depth: 0,
  path: slug,
  childCount: 0,
  shopCount: 0,
  planCount: 0,
  systemSlug: "smoke-system",
  systemName: "Smoke",
  createdAt: now,
  ...extra,
});

async function main() {
  const client = await MongoClient.connect(uri);
  const db = client.db();
  const upsert = (
    collection: string,
    key: Record<string, unknown>,
    doc: Record<string, unknown>,
  ) =>
    db.collection(collection).updateOne(key, { $set: doc }, { upsert: true });

  await upsert(
    "blueprints",
    { slug: "smoke-blueprint" },
    {
      id: "smoke-blueprint",
      name: "Smoke Rifle",
      slug: "smoke-blueprint",
      category: "Weapons",
      description: "Blueprint de test",
      obtention: "Mission de test",
      recipe: {
        craftingTime: 60,
        components: [
          {
            name: "Barrel",
            options: [{ name: "Iron", quantity: 2, unit: "SCU" }],
          },
        ],
      },
    },
  );
  for (const [slug, name] of [
    ["smoke-item", "Smoke Rifle"],
    ["smoke-item-2", "Smoke Pistol"],
  ]) {
    await upsert(
      "gameItems",
      { slug },
      {
        id: slug,
        slug,
        name,
        kind: "weapon",
        category: "Weapons",
        manufacturer: "Smoke Arms",
        statistics: { damage: { value: slug === "smoke-item" ? 40 : 20 } },
      },
    );
  }
  await upsert(
    "gameLocations",
    { slug: "smoke-moon" },
    place("smoke-moon", "Smoke Moon", {
      type: "moon",
      celestial: {
        x: 1e9,
        y: 0,
        z: 0,
        radius: 100_000,
        zoneRadius: 300_000,
        rotationHours: 0,
        rotationAdjust: 0,
      },
    }),
  );
  await upsert(
    "gameLocations",
    { slug: "smoke-outpost" },
    place("smoke-outpost", "Smoke Outpost", {
      type: "outpost",
      parentSlug: "smoke-moon",
      parentName: "Smoke Moon",
      bodySlug: "smoke-moon",
      bodyName: "Smoke Moon",
      services: ["refinery"],
      position: { body: "smoke-moon", x: 100_000, y: 0, z: 0 },
      plans: [
        {
          id: "smoke-plan",
          name: "Rez-de-chaussée",
          kind: "drawn",
          widthCm: 2000,
          heightCm: 1000,
          markers: [],
          levels: [
            {
              id: "smoke-level",
              name: "RDC",
              order: 0,
              rooms: [
                {
                  id: "r1",
                  name: "Hangar",
                  kind: "storage",
                  x: 0,
                  y: 0,
                  w: 1000,
                  h: 1000,
                  rot: 0,
                  fill: "plain",
                  label: true,
                },
              ],
              walls: [],
              doors: [],
              labels: [],
              measures: [],
            },
          ],
        },
      ],
      planCount: 1,
    }),
  );
  await upsert(
    "gameLocations",
    { slug: "smoke-station" },
    place("smoke-station", "Smoke Station", {
      type: "station",
      bodySlug: "smoke-moon",
      bodyName: "Smoke Moon",
      position: { body: "smoke-moon", x: 0, y: 100_000, z: 0 },
    }),
  );
  await upsert(
    "users",
    { _id: ownerId },
    { name: "SmokeSeller#0001", email: "smoke@example.test" },
  );
  await upsert(
    "shops",
    { id: "smoke-shop" },
    {
      id: "smoke-shop",
      name: "Smoke Shop",
      description: "Magasin de test",
      ownerId,
      sellers: [ownerId],
      createdAt: now,
    },
  );
  await upsert(
    "shopItems",
    { id: "smoke-listing" },
    {
      id: "smoke-listing",
      name: "Smoke Rifle",
      type: "OBJECT",
      description: "Annonce de test",
      image: "",
      price: "1500",
      stock: 50,
      reserved: 0,
      shopId: "smoke-shop",
      createdAt: now,
      itemSlug: "smoke-item",
      category: "Weapons",
      location: { id: "smoke-outpost", name: "Smoke Outpost", system: "Smoke" },
    },
  );
  // Les lieux d'inventaire du catalogue, comme le miroir des lieux en crée.
  for (const place of ["smoke-outpost", "smoke-station"]) {
    await upsert(
      "locations",
      { placeSlug: place },
      {
        placeSlug: place,
        name: place === "smoke-outpost" ? "Smoke Outpost" : "Smoke Station",
        slug: place,
        system: "Smoke",
      },
    );
  }
  // La marketplace : les commandes et paniers des essais précédents partent.
  await db
    .collection("shopOrders")
    .deleteMany({ shopId: { $regex: "^smoke-" } });
  await db
    .collection("carts")
    .updateMany({}, {
      $pull: { lines: { listingId: { $regex: "^smoke-" } } },
    } as never);
  const sellerEmail = process.env.MCP_SMOKE_SELLER_EMAIL;
  const seller = sellerEmail
    ? await db.collection("users").findOne({ email: sellerEmail })
    : null;
  if (sellerEmail && !seller) {
    console.warn(`Aucun compte ${sellerEmail} : magasin vendeur non créé.`);
  }
  if (seller) {
    await upsert(
      "shops",
      { id: "smoke-shop-2" },
      {
        id: "smoke-shop-2",
        name: "Smoke Shop 2",
        description: "Magasin de test du compte de fumée",
        ownerId: seller._id,
        sellers: [seller._id],
        createdAt: now,
      },
    );
    await db.collection("shopItems").deleteMany({
      shopId: "smoke-shop-2",
      id: { $ne: "smoke-own-listing" },
    });
    await upsert(
      "shopItems",
      { id: "smoke-own-listing" },
      {
        id: "smoke-own-listing",
        name: "Smoke Helmet",
        type: "OBJECT",
        description: "Annonce de test du compte de fumée",
        image: "",
        price: 800,
        stock: 10,
        reserved: 0,
        shopId: "smoke-shop-2",
        createdAt: now,
        location: {
          id: "smoke-outpost",
          name: "Smoke Outpost",
          system: "Smoke",
        },
      },
    );
    // Une commande à traiter par époque du protocole essayée.
    for (const era of ["legacy", "2026-07-28"]) {
      await db.collection("shopOrders").insertOne({
        id: `smoke-order-${era}`,
        shopId: "smoke-shop-2",
        userId: ownerId,
        userName: "SmokeSeller#0001",
        kind: "DIRECT",
        message: "1 × Smoke Helmet",
        status: "PENDING",
        lines: [
          {
            listingId: "smoke-own-listing",
            name: "Smoke Helmet",
            quantity: 1,
            unitPrice: 800,
          },
        ],
        pickup: { name: "Smoke Outpost", locationId: "smoke-outpost" },
        total: 800,
        timeline: [],
        createdAt: now,
        updatedAt: now,
      });
    }
  }
  // Les contributions laissées par les essais précédents : sans cela, un
  // compte de niveau 1 atteint vite sa limite de propositions en attente.
  await db
    .collection("contributions")
    .deleteMany({ "target.slug": { $regex: "^smoke-" } });
  console.log("Données de fumée en place.");
  await client.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

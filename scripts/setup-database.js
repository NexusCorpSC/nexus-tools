const { MongoClient } = require("mongodb");

async function main() {
  const dbClient = new MongoClient("mongodb://localhost:27017/nexus-tools");
  const db = dbClient.db();

  const res = await db
    .collection("shopItems")
    .find({
      $text: {
        $search: "Protection",
      },
    })
    .limit(10)
    .toArray();

  console.log(res);

  return;

  //await db.collection("shopItems").dropIndex("name_text");
  await db
    .collection("shopItems")
    .createIndex({ name: "text" }, { name: "name_text" });
}

main()
  .then(() => {
    console.log("Database setup complete.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Database setup failed:", err);
    process.exit(1);
  });

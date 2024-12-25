import { getShop, getShopItemsOfShop } from "@/lib/shop-items";
import Image from "next/image";
import Link from "next/link";

export default async function ShopPage({
  params,
}: {
  params: Promise<{ shopId: string }>;
}) {
  const shop = await getShop((await params).shopId);

  if (!shop) {
    return (
      <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4">
        <h1 className="text-2xl font-bold mb-4">Boutique non trouvée</h1>
      </div>
    );
  }

  const shopItems = await getShopItemsOfShop(shop.id, { offset: 0, limit: 10 });

  return (
    <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4">
      <h1 className="text-2xl font-bold mb-4">{shop.name}</h1>

      <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 xl:gap-x-8">
        {shopItems.map((item) => (
          <Link key={item.id} href={`/shopping/i/${item.id}`} className="group">
            <Image
              alt={item.name}
              src={item.image}
              className="aspect-square w-full rounded-lg bg-gray-200 object-cover group-hover:opacity-75 xl:aspect-[7/8]"
              width={300}
              height={300}
            />
            <h3 className="mt-4 text-sm text-gray-700">{item.name}</h3>
            <p className="mt-1 text-lg font-medium text-gray-900">
              {item.price} aUEC
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}

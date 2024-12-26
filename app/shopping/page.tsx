import { getFeaturedItems, ShopItem } from "@/lib/shop-items";
import Link from "next/link";
import Image from "next/image";

export default async function ShoppingPage() {
  const showcasedItems: ShopItem[] = await getFeaturedItems();

  return (
    <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4 h-dvh">
      <h1 className="text-2xl font-bold mb-4">Shopping</h1>

      <Link
        href="/shopping/sell"
        className="uppercase block rounded-lg bg-primary bg-gradient-to-r from-orange-800 hover:from-orange-600 to-blue-800 hover:to-blue-600 p-8 m-4 text-secondary font-bold"
      >
        Vendre un bien ou un service
      </Link>

      <div>
        <h2 className="text-xl font-bold mb-4">Articles mis en avant</h2>

        <div className="mt-8 grid grid-cols-1 gap-y-12 sm:grid-cols-2 sm:gap-x-6 lg:grid-cols-4 xl:gap-x-8">
          {showcasedItems.map((item) => (
            <div key={item.id}>
              <div className="relative">
                <div className="relative h-72 w-full overflow-hidden rounded-lg">
                  <Image
                    alt={item.name}
                    src={item.image ?? "/item_empty.png"}
                    className="size-full object-cover"
                    width={200}
                    height={200}
                  />
                </div>
                <div className="relative mt-4">
                  <h3 className="text-sm font-medium text-gray-900">
                    {item.name}
                  </h3>
                  <p className="mt-1 text-sm text-gray-500">
                    Magasin :{" "}
                    <Link
                      href={`/shops/${item.shop.id}`}
                      className="text-blue-600 hover:text-blue-700"
                    >
                      {item.shop.name}
                    </Link>
                  </p>
                </div>
                <div className="absolute inset-x-0 top-0 flex h-72 items-end justify-end overflow-hidden rounded-lg p-4">
                  <div
                    aria-hidden="true"
                    className="absolute inset-x-0 bottom-0 h-36 bg-gradient-to-t from-black opacity-50"
                  />
                  <p className="relative text-lg font-semibold text-white">
                    {item.price} aUEC
                  </p>
                </div>
              </div>
              <div className="mt-6">
                <Link
                  href={`/shopping/i/${item.id}`}
                  className="relative flex items-center justify-center rounded-md border border-transparent bg-gray-100 px-8 py-2 text-sm font-medium text-gray-900 hover:bg-gray-200"
                >
                  Acheter
                  <span className="sr-only">, {item.name}</span>
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>

      <h2 className="text-xl font-bold mb-4">Magasins</h2>
    </div>
  );
}

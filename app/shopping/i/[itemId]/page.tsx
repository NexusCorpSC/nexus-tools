import { getShopItem } from "@/lib/shop-items";
import Link from "next/link";
import { CheckIcon } from "@radix-ui/react-icons";
import { ShieldCheckIcon } from "@heroicons/react/24/solid";
import Image from "next/image";

export default async function ShopItemDetailsPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const item = await getShopItem((await params).itemId);

  if (!item) {
    return (
      <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4">
        <h1 className="text-2xl font-bold mb-4">Objet non trouvé</h1>

        <Link href="/shopping">Retour au shopping</Link>
      </div>
    );
  }

  return (
    <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4">
      <div className="mx-auto max-w-2xl px-4 py-16 sm:px-6 sm:py-24 lg:grid lg:max-w-7xl lg:grid-cols-2 lg:gap-x-8 lg:px-8">
        <div className="lg:max-w-lg lg:self-end">
          <nav aria-label="Breadcrumb">
            <ol role="list" className="flex items-center space-x-2"></ol>
          </nav>

          <div className="mt-4">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              {item.name}
            </h1>
          </div>

          <section aria-labelledby="information-heading" className="mt-4">
            <h2 id="information-heading" className="sr-only">
              Product information
            </h2>

            <div className="flex items-center">
              <p className="text-lg text-gray-900 sm:text-xl">
                {item.price} aUEC
              </p>
            </div>

            <div className="flex items-center">
              <p className="text-md text-gray-600 sm:text-lg">
                Vendu par :{" "}
                <Link
                  href={`/shops/${item.shop.id}`}
                  className="text-blue-600 hover:text-blue-800"
                >
                  {item.shop.name}
                </Link>
              </p>
            </div>

            <div className="mt-4 space-y-6">
              <p className="text-base text-gray-500">{item.description}</p>
            </div>

            <div className="mt-6 flex items-center">
              <CheckIcon
                aria-hidden="true"
                className="size-5 shrink-0 text-green-500"
              />
              <p className="ml-2 text-sm text-gray-500">En stock</p>
            </div>
          </section>
        </div>

        <div className="mt-10 lg:col-start-2 lg:row-span-2 lg:mt-0 lg:self-center">
          <Image
            alt={item.name}
            src={item.image}
            className="aspect-square w-full rounded-lg object-cover"
            width={500}
            height={500}
          />
        </div>

        <div className="mt-10 lg:col-start-1 lg:row-start-2 lg:max-w-lg lg:self-start">
          <section aria-labelledby="options-heading">
            <form>
              <div className="mt-10">
                <button
                  type="submit"
                  className="flex w-full items-center justify-center rounded-md border border-transparent bg-indigo-600 px-8 py-3 text-base font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-50"
                >
                  Acheter
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}

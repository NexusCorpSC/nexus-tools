import { getShopItem } from "@/lib/shop-items";
import Link from "next/link";
import { CheckIcon, CrossCircledIcon } from "@radix-ui/react-icons";
import Image from "next/image";
import { ExclamationTriangleIcon } from "@heroicons/react/24/solid";
import { Suspense } from "react";
import { StockModificationSection } from "@/app/shopping/i/[itemId]/server-components";
import { getTranslations } from "next-intl/server";

export default async function ShopItemDetailsPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const t = await getTranslations("ShoppingItem");

  const item = await getShopItem((await params).itemId);

  if (!item) {
    return (
      <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4">
        <h1 className="text-2xl font-bold mb-4">{t("notFound")}</h1>

        <Link href="/shopping">{t("backToShopping")}</Link>
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
              {t("productInfo")}
            </h2>

            <div className="flex items-center">
              <p className="text-lg text-gray-900 sm:text-xl">
                {item.price} aUEC
              </p>
            </div>

            <div className="flex items-center">
              <p className="text-md text-gray-600 sm:text-lg">
                {t("soldBy")}{" "}
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

            {item.stock <= 0 && (
              <div className="mt-6 flex items-center">
                <CrossCircledIcon
                  aria-hidden="true"
                  className="size-5 shrink-0 text-red-500"
                />
                <p className="ml-2 text-sm text-gray-500">{t("soldOut")}</p>
              </div>
            )}
            {item.stock > 0 && item.stock <= 5 && (
              <div className="mt-6 flex items-center">
                <ExclamationTriangleIcon
                  aria-hidden="true"
                  className="size-5 shrink-0 text-orange-500"
                />
                <p className="ml-2 text-sm text-gray-500">{t("lowStock")}</p>
              </div>
            )}
            {item.stock > 5 && (
              <div className="mt-6 flex items-center">
                <CheckIcon
                  aria-hidden="true"
                  className="size-5 shrink-0 text-green-500"
                />
                <p className="ml-2 text-sm text-gray-500">{t("inStock")}</p>
              </div>
            )}
            <div className="pt-4">
              <Suspense fallback={<></>}>
                <StockModificationSection item={item} />
              </Suspense>
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
                  {t("buy")}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}

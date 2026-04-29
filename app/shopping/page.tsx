import { getFeaturedItems, ShopItem } from "@/lib/shop-items";
import Link from "next/link";
import Image from "next/image";
import { getTranslations } from "next-intl/server";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export default async function ShoppingPage() {
  const t = await getTranslations("Shopping");

  const showcasedItems: ShopItem[] = await getFeaturedItems();

  return (
    <div className="m-2 mx-auto max-w-7xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm h-dvh">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">{t("home")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <h1 className="text-2xl font-bold mb-4">{t("title")}</h1>

      <Link
        href="/shopping/sell"
        className="block rounded-lg bg-primary bg-linear-to-r p-4 m-4 text-secondary font-bold"
      >
        {t("ctaSellButton")}
      </Link>

      <div>
        <h2 className="text-xl font-bold mb-4">{t("featuredItemsTitle")}</h2>

        {showcasedItems.length === 0 ? (
          <p>{t("noFeaturedItems")}</p>
        ) : (
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
                    <h3 className="text-sm font-medium ">{item.name}</h3>
                    <p className="mt-1 text-sm ">
                      {t("shop")} :{" "}
                      <Link
                        href={`/shops/${item.shop.id}`}
                        className="text-nexus-primary/70 hover:text-nexus-primary"
                      >
                        {item.shop.name}
                      </Link>
                    </p>
                  </div>
                  <div className="absolute inset-x-0 top-0 flex h-72 items-end justify-end overflow-hidden rounded-lg p-4">
                    <div
                      aria-hidden="true"
                      className="absolute inset-x-0 bottom-0 h-36 bg-linear-to-t from-black opacity-50"
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
                    {t("buy")}
                    <span className="sr-only">, {item.name}</span>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div>
        <h2 className="text-xl font-bold mb-4">{t("shops")}</h2>
        <p>{t("noShops")}</p>
      </div>
    </div>
  );
}

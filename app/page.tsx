import Link from "next/link";
import Image from "next/image";

import ImgCrafting from "./img-crafting.png";
import ImgReputation from "./img-reputation.png";
import ImgShopping from "./img-shopping.png";

export default function Home() {
  return (
    <div className="m-2 p-6 mx-auto bg-white rounded-xl shadow-md space-y-4">
      <h1 className="text-2xl font-bold mb-4">Bienvenue !</h1>

      <p>
        Nexus Tools est un ensemble d&apos;outils à votre disposition pour
        organiser votre activité dans le Verse.
      </p>

      <p>
        La boîte à outils est en période de développement et certaines
        fonctionnalités sont réservées à un ensemble de courageux testeurs. Si
        vous souhaitez participer à l&apos;aventure, contactez la Nexus
        Corporation ! Dans tous les cas, vos retours sur les fonctionnalités
        publiques sont les bienvenus !
      </p>

      <div className="mx-auto max-w-2xl px-6 lg:max-w-7xl lg:px-8">
        <h2 className="text-center text-base/7 font-semibold text-indigo-600">
          Organisez-vous !
        </h2>
        <p className="mx-auto mt-2 max-w-lg text-balance text-center text-4xl font-semibold tracking-tight text-gray-950 sm:text-5xl">
          Des outils pour faciliter la vie en communauté.
        </p>
        <div className="mt-10 grid gap-4 sm:mt-16 lg:grid-cols-3 lg:grid-rows-2">
          <div className="relative lg:row-span-2">
            <div className="absolute inset-px rounded-lg bg-white lg:rounded-l-[2rem]"></div>
            <Link
              href="/shopping"
              className="relative flex h-full flex-col overflow-hidden rounded-[calc(theme(borderRadius.lg)+1px)] lg:rounded-l-[calc(2rem+1px)] hover:bg-gray-200"
            >
              <div className="px-8 pb-3 pt-8 sm:px-10 sm:pb-0 sm:pt-10">
                <p className="mt-2 text-lg font-medium tracking-tight text-gray-950 max-lg:text-center">
                  Marketplace
                </p>
                <p className="mt-2 max-w-lg text-sm/6 text-gray-600 max-lg:text-center">
                  Vendez vos objets et services aux autres explorateurs du Verse
                  ou trouvez ce dont vous avez besoin !
                </p>
              </div>
              <div className="relative min-h-[30rem] w-full grow [container-type:inline-size] max-lg:mx-auto max-lg:max-w-sm">
                <div className="absolute inset-x-10 bottom-0 top-10 overflow-hidden rounded-t-[12cqw] bg-gray-900 shadow-2xl">
                  <Image
                    className="size-full object-cover object-top"
                    src={ImgShopping}
                    alt=""
                  />
                </div>
              </div>
            </Link>
            <div className="pointer-events-none absolute inset-px rounded-lg shadow ring-1 ring-black/5 lg:rounded-l-[2rem]"></div>
          </div>
          <div className="relative max-lg:row-start-1">
            <div className="absolute inset-px rounded-lg bg-white max-lg:rounded-t-[2rem]"></div>
            <Link
              href="/crafting"
              className="relative flex h-full flex-col overflow-hidden rounded-[calc(theme(borderRadius.lg)+1px)] max-lg:rounded-t-[calc(2rem+1px)] hover:bg-gray-200"
            >
              <div className="px-8 pt-8 sm:px-10 sm:pt-10">
                <p className="mt-2 text-lg font-medium tracking-tight text-gray-950 max-lg:text-center">
                  Artisanat
                </p>
                <p className="mt-2 max-w-lg text-sm/6 text-gray-600 max-lg:text-center">
                  Gérez vos recettes au sein de votre organisation et louez vos
                  compétences aux acheteurs interessés.
                </p>
              </div>
              <div className="flex flex-1 items-center justify-center px-8 max-lg:pb-12 max-lg:pt-10 sm:px-10 lg:pb-2">
                <Image
                  className="w-full max-lg:max-w-xs"
                  alt=""
                  src={ImgCrafting}
                />
              </div>
            </Link>
            <div className="pointer-events-none absolute inset-px rounded-lg shadow ring-1 ring-black/5 max-lg:rounded-t-[2rem]"></div>
          </div>
          <div className="relative max-lg:row-start-3 lg:col-start-2 lg:row-start-2">
            <div className="absolute inset-px rounded-lg bg-white"></div>
            <Link
              href="/reps"
              className="relative flex h-full flex-col overflow-hidden rounded-[calc(theme(borderRadius.lg)+1px)] hover:bg-gray-200"
            >
              <div className="px-8 pt-8 sm:px-10 sm:pt-10">
                <p className="mt-2 text-lg font-medium tracking-tight text-gray-950 max-lg:text-center">
                  Réputation
                </p>
                <p className="mt-2 max-w-lg text-sm/6 text-gray-600 max-lg:text-center">
                  Centralisez les réputations des membres de votre guilde pour
                  faciliter vos sorties et les partages de missions.
                </p>
              </div>
              <div className="flex flex-1 items-center [container-type:inline-size] max-lg:py-6 lg:pb-2">
                <Image
                  className="h-[min(152px,40cqw)] object-cover"
                  src={ImgReputation}
                  alt=""
                />
              </div>
            </Link>
            <div className="pointer-events-none absolute inset-px rounded-lg shadow ring-1 ring-black/5"></div>
          </div>
          <div className="relative lg:row-span-2">
            <div className="absolute inset-px rounded-lg bg-white max-lg:rounded-b-[2rem] lg:rounded-r-[2rem]"></div>
            <Link
              href="/developers"
              className="relative flex h-full flex-col overflow-hidden rounded-[calc(theme(borderRadius.lg)+1px)] max-lg:rounded-b-[calc(2rem+1px)] lg:rounded-r-[calc(2rem+1px)] hover:bg-gray-200"
            >
              <div className="px-8 pb-3 pt-8 sm:px-10 sm:pb-0 sm:pt-10">
                <p className="mt-2 text-lg font-medium tracking-tight text-gray-950 max-lg:text-center">
                  API first
                </p>
                <p className="mt-2 max-w-lg text-sm/6 text-gray-600 max-lg:text-center">
                  Intégrez nos outils directement dans vos applications via
                  notre API ouverte.
                </p>
              </div>
              <div className="relative min-h-[30rem] w-full grow [container-type:inline-size] max-lg:mx-auto max-lg:max-w-sm">
                <div className="absolute inset-x-10 bottom-0 top-10 overflow-hidden rounded-t-[12cqw] border-x-[3cqw] border-t-[3cqw] border-gray-700 bg-gray-900 shadow-2xl">
                  <pre className="text-white pt-10 pl-4 text-wrap">
                    const playersWithRep = await
                    <br />
                    fetch('https://tools.nexus.services/reps');
                  </pre>
                </div>
              </div>
            </Link>
            <div className="pointer-events-none absolute inset-px rounded-lg shadow ring-1 ring-black/5 max-lg:rounded-b-[2rem] lg:rounded-r-[2rem]"></div>
          </div>
        </div>
      </div>
    </div>
  );
}

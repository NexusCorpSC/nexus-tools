import { auth, signIn } from "@/auth";
import db from "@/lib/db";
import { ObjectId } from "bson";
import { User } from "@/app/(auth)/profile/page";
import { Shop } from "@/lib/shop-items";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PhotoIcon } from "@heroicons/react/24/solid";
import { addArticleToShop } from "@/app/shopping/actions";
import Link from "next/link";

export default async function SellPage() {
  const session = await auth();

  if (!session || !session.user) {
    return signIn(undefined, { redirectTo: "/shopping/sell" });
  }

  const user = await db
    .db()
    .collection<User>("users")
    .findOne({ _id: new ObjectId(session.user.id) });

  if (!user) {
    return signIn(undefined, { redirectTo: "/shopping/sell" });
  }

  const selectedShop = await db
    .db()
    .collection<Shop>("shops")
    .findOne({ id: user.defaultShopId });

  const userShops = await db
    .db()
    .collection<Shop>("shops")
    .find({ ownerId: user._id })
    .toArray();

  if (userShops.length === 0) {
    return (
      <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4 h-dvh">
        <h1 className="text-2xl font-bold mb-4">Vente</h1>

        <p>
          Vous n&apos;êtes membre d&apos;aucun magasin et ne pouvez donc pas
          vendre d&apos;objets sur cette plateforme.
        </p>

        <p>
          Nous limitons les accès aux vendeurs pour garantir la qualité du
          service. Nous ingénieurs systèmes travaillent dur pour ouvrir la
          plateforme à tout les vendeurs du Verse!
        </p>

        <p>Contactez la Nexus Corporation pour obtenir une license de vente.</p>
      </div>
    );
  }

  return (
    <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4 h-dvh">
      <h1 className="text-2xl font-bold mb-4">Vente</h1>

      <form action={addArticleToShop}>
        <div>
          <label
            htmlFor="shopId"
            className="block text-sm/6 font-medium text-gray-900"
          >
            Magasin de vente
          </label>

          <div className="mt-2">
            <Select name="shopId" defaultValue={selectedShop?.id} required>
              <SelectTrigger>
                <SelectValue placeholder="Choisissez votre magasin" />
              </SelectTrigger>
              <SelectContent>
                {userShops.map((shop) => (
                  <SelectItem key={shop.id} value={shop.id}>
                    {shop.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <label
            htmlFor="name"
            className="block text-sm/6 font-medium text-gray-900"
          >
            Nom de l&apos;article
          </label>
          <div className="mt-2">
            <input
              id="name"
              name="name"
              type="text"
              placeholder="Un objet..."
              required
              className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
              maxLength={500}
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="type"
            className="block text-sm/6 font-medium text-gray-900"
          >
            Type d&apos;article
          </label>
          <div className="mt-2">
            <Select name="type" required>
              <SelectTrigger>
                <SelectValue placeholder="Type d'article" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="OBJECT">Bien/objet</SelectItem>
                <SelectItem value="SERVICE">Service</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div>
          <label
            htmlFor="description"
            className="block text-sm/6 font-medium text-gray-900"
          >
            Description de l&apos;article
          </label>
          <div className="mt-2">
            <textarea
              id="description"
              name="description"
              rows={3}
              className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
              defaultValue={""}
              required
              maxLength={5000}
            />
          </div>
          <p className="mt-3 text-sm/6 text-gray-600">
            Décrivez le produit ou le service en quelques lignes. Restez concis
            pour maximiser l&apos;impact de votre annonce !
          </p>
        </div>

        <div>
          <label
            htmlFor="price"
            className="block text-sm/6 font-medium text-gray-900"
          >
            Prix de vente (aUEC) (ou prix minimum pour un service)
          </label>
          <div className="mt-2">
            <input
              id="price"
              name="price"
              type="number"
              step={500}
              min={0}
              required
              defaultValue={5000}
              className="block w-full rounded-md bg-white px-3 py-1.5 text-base text-gray-900 outline outline-1 -outline-offset-1 outline-gray-300 placeholder:text-gray-400 focus:outline focus:outline-2 focus:-outline-offset-2 focus:outline-indigo-600 sm:text-sm/6"
            />
          </div>
        </div>

        <div>
          <label
            htmlFor="image-cover"
            className="block text-sm/6 font-medium text-gray-900"
          >
            Image de l&apos;article
          </label>
          <div className="mt-2 flex justify-center rounded-lg border border-dashed border-gray-900/25 px-6 py-10">
            <div className="text-center">
              <PhotoIcon
                aria-hidden="true"
                className="mx-auto size-12 text-gray-300"
              />
              <div className="mt-4 flex text-sm/6 text-gray-600">
                <label
                  htmlFor="image"
                  className="relative cursor-pointer rounded-md bg-white font-semibold text-indigo-600 focus-within:outline-none focus-within:ring-2 focus-within:ring-indigo-600 focus-within:ring-offset-2 hover:text-indigo-500"
                >
                  <span>Téléversez une image</span>
                  <input
                    id="image"
                    name="image"
                    type="file"
                    className="sr-only"
                    accept=".png,.jpg,.jpeg"
                    required
                  />
                </label>
                <p className="pl-1">ou glisser-déposer</p>
              </div>
              <p className="text-xs/5 text-gray-600">PNG ou JPG, max 2MB</p>
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-end gap-x-6">
          <Link
            href="/shopping"
            className="text-sm/6 font-semibold text-gray-900"
          >
            Annuler
          </Link>
          <button
            type="submit"
            className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Ajouter l&apos;article au magasin
          </button>
        </div>
      </form>
    </div>
  );
}

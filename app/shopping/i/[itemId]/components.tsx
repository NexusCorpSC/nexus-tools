"use client";

import { MinusIcon, PlusIcon } from "@heroicons/react/24/solid";
import { useState } from "react";
import { incrementShopItemStock } from "@/app/shopping/actions";

export function StockModificationForm({ itemId }: { itemId: string }) {
  const [stockModification, setStockModification] = useState(0);

  return (
    <form
      onSubmit={async (event) => {
        event?.preventDefault();

        await incrementShopItemStock(itemId, stockModification);

        setStockModification(0);
      }}
    >
      <span className="isolate inline-flex rounded-md shadow-sm">
        <button
          type="button"
          className="relative inline-flex items-center rounded-l-md bg-white px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-10"
          onClick={() => setStockModification(stockModification - 1)}
        >
          <span className="sr-only">Retirer 1</span>
          <MinusIcon aria-hidden="true" className="size-5" />
        </button>
        <input
          type="number"
          name="stockModification"
          id="stockModification"
          className="w-20 ring-1 ring-inset ring-gray-300 px-2 py-2 text-center text-gray-400"
          value={stockModification}
          onChange={(event) =>
            setStockModification(parseInt(event.target.value))
          }
        />
        <button
          type="button"
          className="relative -ml-px inline-flex items-center rounded-r-md bg-white px-2 py-2 text-gray-400 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus:z-10"
          onClick={() => setStockModification(stockModification + 1)}
        >
          <span className="sr-only">Ajouter 1</span>
          <PlusIcon aria-hidden="true" className="size-5" />
        </button>
        <button
          type="submit"
          className="ml-4 rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          {stockModification < 0 ? "Retirer du" : "Ajouter au"} stock
        </button>
      </span>
    </form>
  );
}

export type Location = {
    id: string;
    name: string;
    slug?: string;
    system?: string;
    userId?: string;
    /**
     * Le lieu du catalogue dont cette ligne est le reflet, quand il y en a un
     * (`gameLocations`, voir `types/places.ts`). Posé par
     * `scripts/sync-inventory-locations.ts` ; absent d'un lieu qu'un joueur a
     * nommé lui-même. C'est lui qui remplit enfin `slug` et `system`, déclarés
     * depuis l'origine et écrits par rien.
     */
    placeSlug?: string;
};

export type InventoryItem = {
    id: string;

    name: string;
    description?: string;
    quality?: number;
    quantity: number;
    unit?: string;
    /**
     * The part of `quantity` promised to a parcel still waiting
     * (`lib/parcels.ts`): it cannot go in another one. Absent when none is.
     */
    reserved?: number;

    locationId: Location['id'];
    userId: string;

    orgVisible: boolean;

    updatedAt: string;
};

export type InventoryItemWithLocation = InventoryItem & {
    location: Location | null;
    /** Les annonces qui suivent ce lot, dans les magasins où il est en vente. */
    sales?: LotSale[];
};

/**
 * Une annonce de la marketplace qui suit ce lot (`lib/lot-sales.ts`).
 * `stock` compte ce que des commandes réservent déjà.
 */
export type LotSale = {
    listingId: string;
    shopId: string;
    shopName: string;
    price: number;
    stock: number;
    reserved: number;
    /** Le plafond choisi à la mise en vente ; absent, tout le lot se vend. */
    lotLimit?: number;
    /** Visible sur la marketplace : ni retirée par un vendeur, ni masquée. */
    onSale: boolean;
};

/** Un magasin où le joueur peut mettre un lot en vente. */
export type SellerShop = {
    id: string;
    name: string;
    logo?: string;
    /** Son magasin par défaut, présélectionné. */
    isDefault: boolean;
};

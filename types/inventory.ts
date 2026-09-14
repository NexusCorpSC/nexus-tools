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

    locationId: Location['id'];
    userId: string;

    orgVisible: boolean;

    updatedAt: string;
};

export type InventoryItemWithLocation = InventoryItem & {
    location: Location | null;
};

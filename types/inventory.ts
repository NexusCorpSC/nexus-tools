export type Location = {
    id: string;
    name: string;
    slug?: string;
    system?: string;
    userId?: string;
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

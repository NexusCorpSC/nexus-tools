import { Blueprint } from "@/types/crafting";
import { addBlueprintAction } from "./actions";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "@heroicons/react/24/solid";
import { useCallback, useState } from "react";
import { useTranslations } from "next-intl";
import { Loader2 } from "lucide-react";

export function BlueprintQuickAdd({ blueprint }: { blueprint: Blueprint & { owned?: boolean } }) {
    const [isAdding, setIsAdding] = useState(false);
    
    const onClick = useCallback(async (e: React.MouseEvent<HTMLButtonElement>) => {
        e.preventDefault();

        setIsAdding(true);

        await addBlueprintAction(blueprint.id, blueprint.slug);
        blueprint.owned = true;

        setIsAdding(false);
    }, [blueprint.id, blueprint.slug, addBlueprintAction, setIsAdding, isAdding]);
    const t = useTranslations("Crafting.Blueprints");
    
    return (
        <Button
            className="absolute top-2 right-2 px-2 py-0.1 text-xs opacity-0 group-hover:opacity-100 transition-opacity p-2 rounded-lg bg-primary/90 hover:bg-primary text-primary-foreground shadow-lg disabled:opacity-50 cursor-pointer"
            title={t("ownershipAdd")}
            onClick={onClick}
            disabled={isAdding}
        >
            {!isAdding && <PlusIcon className="size-5" />}
            {isAdding && <div className="animate-spin"><Loader2 className="size-5" /></div>}
        </Button>
    )
}
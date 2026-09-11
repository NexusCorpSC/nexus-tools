"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  ChevronLeftIcon,
  ChevronRightIcon,
  MagnifyingGlassIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { deleteItemAction } from "@/app/items/actions";
import type { ItemListResponse, ItemSummary } from "@/types/items";

const PAGE_SIZE = 20;

/** Table of every in-game object, with edit and delete shortcuts. */
export function ItemsManager() {
  const t = useTranslations("Items.Admin");
  const tItems = useTranslations("Items");

  const [query, setQuery] = useState("");
  const [items, setItems] = useState<ItemSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<ItemSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (search: string, requestedPage: number) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        page: String(requestedPage),
      });
      if (search.trim()) params.set("query", search.trim());

      const response = await fetch(`/api/items?${params.toString()}`);
      const data: ItemListResponse = await response.json();

      setItems(data.items);
      setTotal(data.total);
      setTotalPages(data.totalPages);
      setPage(data.page);
    } catch {
      setItems([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => load(query, 1), 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, load]);

  async function confirmDelete() {
    if (!pendingDelete) return;

    setIsDeleting(true);
    setError(null);

    const result = await deleteItemAction(pendingDelete.slug);
    setIsDeleting(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }

    setPendingDelete(null);
    await load(query, page);
  }

  return (
    <div className="space-y-4">
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
        <Input
          value={query}
          className="pl-9"
          placeholder={tItems("searchPlaceholder")}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="overflow-x-auto rounded-lg border border-[#9ED0FF]/15">
        <table className="w-full text-sm">
          <thead className="bg-white/5">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">
                {t("columnName")}
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">
                {t("columnKind")}
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide">
                {t("columnCategory")}
              </th>
              <th className="px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide">
                {t("columnActions")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#9ED0FF]/10">
            {isLoading ? (
              <tr>
                <td className="px-3 py-6 text-center text-nexus" colSpan={4}>
                  {t("loading")}
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td className="px-3 py-6 text-center text-nexus" colSpan={4}>
                  {tItems("noResults")}
                </td>
              </tr>
            ) : (
              items.map((item) => (
                <tr key={item.id}>
                  <td className="px-3 py-2">
                    <Link
                      href={`/items/${item.slug}`}
                      className="font-medium hover:underline"
                    >
                      {item.name}
                    </Link>
                    {item.variantName && (
                      <span className="text-xs text-nexus">
                        {" "}
                        · {item.variantName}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2">{tItems(`kinds.${item.kind}`)}</td>
                  <td className="px-3 py-2">
                    {[item.category, item.subcategory]
                      .filter(Boolean)
                      .join(" › ")}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex justify-end gap-1">
                      <Button asChild variant="ghost" size="icon-sm">
                        <Link
                          href={`/admin/items/${item.slug}/edit`}
                          aria-label={t("edit")}
                        >
                          <PencilIcon className="size-4" />
                        </Link>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("delete")}
                        onClick={() => {
                          setError(null);
                          setPendingDelete(item);
                        }}
                      >
                        <TrashIcon className="size-4 text-red-500" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-nexus">
          {tItems("resultsCount", { count: total })}
        </p>
        {totalPages > 1 && (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1 || isLoading}
              onClick={() => load(query, page - 1)}
            >
              <ChevronLeftIcon className="size-4" />
              {tItems("paginationPrev")}
            </Button>
            <span className="text-sm text-nexus">
              {tItems("paginationPage", { page, totalPages })}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages || isLoading}
              onClick={() => load(query, page + 1)}
            >
              {tItems("paginationNext")}
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>
        )}
      </div>

      <Dialog
        open={!!pendingDelete}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteConfirmTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteConfirmDescription")}
            </DialogDescription>
          </DialogHeader>
          {pendingDelete && (
            <p className="text-sm font-medium">{pendingDelete.name}</p>
          )}
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={isDeleting}>
                {t("deleteConfirmCancel")}
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "…" : t("deleteConfirmConfirm")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

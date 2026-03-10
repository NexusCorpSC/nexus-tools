"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import {
  UserGroupIcon,
  EllipsisVerticalIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { BlueprintOrgMember } from "@/lib/crafting";
import { deleteBlueprintAction } from "@/app/crafting/blueprints/actions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Link from "next/link";

type Org = { id: string; name: string };

type Props = {
  blueprintId: string;
  organizations: Org[];
  sectionTitle: string;
  selectPlaceholder: string;
  emptyLabel: string;
  loadingLabel: string;
  noOrgsLabel: string;
};

export function BlueprintOrgOwnersClient({
  blueprintId,
  organizations,
  sectionTitle,
  selectPlaceholder,
  emptyLabel,
  loadingLabel,
  noOrgsLabel,
}: Props) {
  const firstOrgId = organizations[0]?.id ?? "";
  const [selectedOrgId, setSelectedOrgId] = useState<string>(firstOrgId);
  const [members, setMembers] = useState<BlueprintOrgMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  const fetchMembers = useCallback(
    async (orgId: string) => {
      if (!orgId) {
        setMembers([]);
        setHasFetched(false);
        return;
      }
      setIsLoading(true);
      setHasFetched(false);
      try {
        const res = await fetch(
          `/api/blueprints/${blueprintId}/org-owners?orgId=${encodeURIComponent(orgId)}`,
        );
        const data: BlueprintOrgMember[] = await res.json();
        setMembers(data);
      } catch {
        setMembers([]);
      } finally {
        setIsLoading(false);
        setHasFetched(true);
      }
    },
    [blueprintId],
  );

  // Fetch automatiquement au montage pour la première organisation
  useEffect(() => {
    if (firstOrgId) {
      fetchMembers(firstOrgId);
    }
  }, [firstOrgId, fetchMembers]);

  const handleOrgChange = (orgId: string) => {
    setSelectedOrgId(orgId);
    fetchMembers(orgId);
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <UserGroupIcon className="size-5 text-gray-500 shrink-0" />
        <h2 className="text-sm font-semibold text-gray-700">{sectionTitle}</h2>
      </div>

      {organizations.length === 0 ? (
        <p className="text-sm text-gray-500">{noOrgsLabel}</p>
      ) : (
        <>
          <select
            value={selectedOrgId}
            onChange={(e) => handleOrgChange(e.target.value)}
            className="w-full max-w-xs rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-xs focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
          >
            {organizations.map((org) => (
              <option key={org.id} value={org.id}>
                {org.name}
              </option>
            ))}
          </select>

          {isLoading && (
            <p className="text-sm text-gray-400 animate-pulse">
              {loadingLabel}
            </p>
          )}

          {!isLoading && hasFetched && members.length === 0 && (
            <p className="text-sm text-gray-500">{emptyLabel}</p>
          )}

          {!isLoading && members.length > 0 && (
            <ul className="divide-y divide-gray-100">
              {members.map((member) => (
                <li
                  key={member.userId}
                  className="flex items-center gap-3 py-2"
                >
                  <Image
                    src={member.avatar || "/avatar_empty.png"}
                    alt={member.name}
                    width={32}
                    height={32}
                    className="rounded-full size-8 object-cover"
                  />
                  <span className="text-sm font-medium text-gray-800">
                    {member.name}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

type AdminBlueprintMenuProps = {
  blueprintId: string;
  blueprintSlug: string;
  labels: {
    menuLabel: string;
    edit: string;
    delete: string;
    deleteConfirmTitle: string;
    deleteConfirmDescription: string;
    deleteConfirmCancel: string;
    deleteConfirmConfirm: string;
  };
};

export function AdminBlueprintMenu({
  blueprintId,
  blueprintSlug,
  labels,
}: AdminBlueprintMenuProps) {
  const [open, setOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    await deleteBlueprintAction(blueprintId);
  };

  return (
    <div className="relative">
      <button
        aria-label={labels.menuLabel}
        onClick={() => setOpen((v) => !v)}
        className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
      >
        <EllipsisVerticalIcon className="size-5 text-gray-500" />
      </button>

      {open && (
        <>
          {/* Overlay to close on outside click */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 w-44 rounded-lg border border-gray-200 bg-white shadow-md py-1">
            <Link
              href={`/crafting/blueprints/${blueprintSlug}/edit`}
              className="flex items-center gap-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors"
              onClick={() => setOpen(false)}
            >
              <PencilIcon className="size-4 text-gray-500" />
              {labels.edit}
            </Link>
            <button
              onClick={() => {
                setOpen(false);
                setConfirmOpen(true);
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
            >
              <TrashIcon className="size-4" />
              {labels.delete}
            </button>
          </div>
        </>
      )}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{labels.deleteConfirmTitle}</DialogTitle>
            <DialogDescription>
              {labels.deleteConfirmDescription}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <DialogClose asChild>
              <Button variant="outline" disabled={isDeleting}>
                {labels.deleteConfirmCancel}
              </Button>
            </DialogClose>
            <Button
              variant="destructive"
              onClick={handleDelete}
              disabled={isDeleting}
            >
              {isDeleting ? "..." : labels.deleteConfirmConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

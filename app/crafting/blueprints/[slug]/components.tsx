"use client";

import { useState } from "react";
import Image from "next/image";
import { UserGroupIcon } from "@heroicons/react/24/outline";
import { BlueprintOrgMember } from "@/lib/crafting";

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
  const [selectedOrgId, setSelectedOrgId] = useState<string>("");
  const [members, setMembers] = useState<BlueprintOrgMember[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasFetched, setHasFetched] = useState(false);

  const handleOrgChange = async (orgId: string) => {
    setSelectedOrgId(orgId);
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
            className="w-full max-w-xs rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="">{selectPlaceholder}</option>
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

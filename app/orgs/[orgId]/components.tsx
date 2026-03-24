"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { generateJoinCode, handleJoinRequest } from "@/app/orgs/actions";
import { CopyIcon, CheckIcon, LinkIcon } from "lucide-react";
import { JoinRequest } from "@/app/orgs/page";
import { ObjectId } from "bson";

// ─── JoinLinkSection ─────────────────────────────────────────────────────────

export function JoinLinkSection({ orgId }: { orgId: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(async () => {
      const code = await generateJoinCode(orgId);
      const base =
        typeof window !== "undefined" ? window.location.origin : "";
      setLink(`${base}/orgs/${orgId}/join/${code}`);
    });
  };

  const copyToClipboard = () => {
    if (!link) return;
    navigator.clipboard.writeText(link).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {!link ? (
        <Button
          variant="outline"
          onClick={handleClick}
          disabled={isPending}
        >
          <LinkIcon className="size-4" />
          {isPending ? "Génération..." : "Afficher le lien d'invitation"}
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <Input readOnly value={link} className="flex-1 text-sm" />
          <Button variant="outline" size="icon" onClick={copyToClipboard}>
            {copied ? (
              <CheckIcon className="size-4 text-green-500" />
            ) : (
              <CopyIcon className="size-4" />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── JoinRequestsSection ─────────────────────────────────────────────────────

type RequestWithUser = JoinRequest & { name: string; avatar?: string };

export function JoinRequestsSection({
  orgId,
  requests,
}: {
  orgId: string;
  requests: RequestWithUser[];
}) {
  if (requests.length === 0) return null;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-2">Demandes d&apos;adhésion</h2>
      <ul className="divide-y divide-gray-100">
        {requests.map((req) => (
          <JoinRequestRow key={req._id.toString()} orgId={orgId} request={req} />
        ))}
      </ul>
    </div>
  );
}

function JoinRequestRow({
  orgId,
  request,
}: {
  orgId: string;
  request: RequestWithUser;
}) {
  const [role, setRole] = useState("Membre");
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const handleAction = (
    action: "accept" | "reject" | "block",
    roleValue?: string,
  ) => {
    startTransition(async () => {
      await handleJoinRequest(
        orgId,
        request._id.toString(),
        action,
        roleValue,
      );
      setOpen(false);
    });
  };

  return (
    <li className="flex justify-between items-center gap-x-4 py-3">
      <div className="flex flex-col">
        <span className="text-sm font-medium">{request.name}</span>
        <span className="text-xs text-gray-400">
          {request.status === "BLOCKED" ? "Bloquée" : "En attente"}
        </span>
      </div>
      <div className="flex gap-2">
        {request.status !== "BLOCKED" && (
          <Button
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => handleAction("block")}
            className="text-yellow-600 hover:text-yellow-700"
          >
            Bloquer
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          disabled={isPending}
          onClick={() => handleAction("reject")}
          className="text-red-500 hover:text-red-700"
        >
          Refuser
        </Button>
        {request.status === "PENDING" && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="default" disabled={isPending}>
                Accepter
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 flex flex-col gap-3">
              <p className="text-sm font-medium">Rôle attribué</p>
              <Input
                placeholder="Ex : Membre, Officier…"
                value={role}
                onChange={(e) => setRole(e.target.value)}
              />
              <Button
                size="sm"
                disabled={isPending}
                onClick={() => handleAction("accept", role)}
              >
                Valider
              </Button>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </li>
  );
}

// Re-export ObjectId so it's importable from this file if needed
export type { RequestWithUser };
export { ObjectId };

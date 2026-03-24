"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { requestToJoin } from "@/app/orgs/actions";

type RequestStatus = "NONE" | "PENDING" | "BLOCKED" | "MEMBER";

export function JoinRequestButton({
  orgId,
  code,
  isAuthenticated,
  requestStatus: initialStatus,
}: {
  orgId: string;
  code: string;
  isAuthenticated: boolean;
  requestStatus: RequestStatus;
}) {
  const [status, setStatus] = useState<RequestStatus>(initialStatus);
  const [isPending, startTransition] = useTransition();

  if (!isAuthenticated) {
    return (
      <p className="text-sm text-gray-500">
        Connectez-vous pour pouvoir demander à rejoindre cette organisation.
      </p>
    );
  }

  if (status === "MEMBER") {
    return (
      <p className="text-sm text-green-600 font-medium">
        Vous êtes déjà membre de cette organisation.
      </p>
    );
  }

  if (status === "BLOCKED") {
    return (
      <p className="text-sm text-red-500 font-medium">
        Vous ne pouvez pas rejoindre cette organisation.
      </p>
    );
  }

  if (status === "PENDING") {
    return (
      <p className="text-sm text-yellow-600 font-medium">
        Votre demande est en attente de validation.
      </p>
    );
  }

  return (
    <Button
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          await requestToJoin(orgId, code);
          setStatus("PENDING");
        });
      }}
    >
      {isPending ? "Envoi…" : "Demander à rejoindre"}
    </Button>
  );
}

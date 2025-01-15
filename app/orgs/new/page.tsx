import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NewOrgPage() {
  return (
    <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4">
      <h1 className="text-2xl font-bold mb-4">Nouvelle Organisation</h1>

      <p>
        Pour le moment, les organisations ne peuvent être créées qu&apos;avec un
        accès bêta assigné par la Nexus Corporation. Contactez-nous pour la
        création de votre compte !
      </p>

      <Button asChild>
        <Link href="/orgs">Retour aux organisations.</Link>
      </Button>
    </div>
  );
}

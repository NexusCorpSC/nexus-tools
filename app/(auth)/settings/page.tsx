import { auth } from "@/auth";

export default async function ProfilePage() {
  const session = await auth();

  if (!session) {
    return <>Not authenticated.</>;
  }

  return (
    <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4">
      <h1 className="text-2xl font-bold mb-4">Paramètres</h1>
    </div>
  );
}

import { revalidatePath } from "next/cache";

export default async function ManageOrganizationPage({
  params,
}: {
  params: { orgId: string };
}) {
  const { orgId } = await params;
  // Action serveur pour supprimer un membre
  const handleRemoveMember = async (formData: FormData) => {
    "use server";

    const memberName = formData.get("memberName") as string;

    console.log(`Supprimer le membre: ${memberName}`);

    revalidatePath(`/orgs/${orgId}/manage`);
  };

  // Fetch initial data from the server
  const { name, tag, image, description, members } = {
    name: "Organization A",
    tag: "ORG-A",
    image: "https://via.placeholder.com/150",
    description: "Description de l'organisation A",
    members: [
      { name: "User A", role: "Leader" },
      { name: "User B", role: "Member" },
      { name: "User C", role: "Member" },
    ],
  };

  return (
    <div>
      <h1>Gérer l'organisation</h1>
      <div>
        <label>Nom de l'organisation:</label>
        <input
          type="text"
          defaultValue={name} /* Ajoutez une logique de soumission */
        />
      </div>
      <div>
        <label>Tag de l'organisation:</label>
        <input
          type="text"
          defaultValue={tag} /* Ajoutez une logique de soumission */
        />
      </div>
      <div>
        <label>Image de l'organisation:</label>
        <input
          type="text"
          defaultValue={image} /* Ajoutez une logique de soumission */
        />
      </div>
      <div>
        <label>Description de l'organisation:</label>
        <textarea
          defaultValue={description} /* Ajoutez une logique de soumission */
        />
      </div>
      <div>
        <h2>Membres de l'organisation</h2>
        <ul>
          {members.map((member, index) => (
            <li key={index}>
              {member.name} - {member.role}
              <form
                action={handleRemoveMember}
                method="post"
                style={{ display: "inline" }}
              >
                <input type="hidden" name="memberName" value={member.name} />
                <button type="submit">Supprimer</button>
              </form>
            </li>
          ))}
        </ul>
        {/* Ajoutez un formulaire pour ajouter un nouveau membre avec nom et rôle */}
      </div>
    </div>
  );
}

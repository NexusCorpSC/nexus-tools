import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { getTranslations } from "next-intl/server";
import { auth } from "@/auth";
import db from "@/lib/db";
import { Organization } from "@/app/orgs/page";
import { ObjectId } from "bson";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { updateOrgProfileAction } from "@/app/orgs/[orgId]/edit/actions";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export default async function EditOrgPage({
  params,
}: {
  params: Promise<{ orgId: string }>;
}) {
  const t = await getTranslations("Organizations");

  const { orgId } = await params;
  const session = await auth();

  const organizations = await db
    .db()
    .collection("organizations")
    .aggregate<
      Omit<Organization, "members"> & {
        members: {
          name: string;
          userId: ObjectId;
          rank: string;
          editor: boolean;
          avatar: string;
        }[];
      }
    >([
      { $match: { _id: orgId } },
      {
        $lookup: {
          from: "users",
          localField: "members.userId",
          foreignField: "_id",
          as: "users",
          pipeline: [{ $project: { name: 1, avatar: 1, _id: 1 } }],
        },
      },
      {
        $addFields: {
          members: {
            $map: {
              input: "$members",
              in: {
                $mergeObjects: [
                  "$$this",
                  {
                    $arrayElemAt: [
                      "$users",
                      { $indexOfArray: ["$users._id", "$$this.userId"] },
                    ],
                  },
                ],
              },
            },
          },
          users: "$$REMOVE",
        },
      },
    ])
    .toArray();
  const organization = organizations[0];

  if (!organization) {
    return (
      <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/orgs">{t("title")}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>Non trouvée</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <h1 className="tex-2xl">{t("notFound")}</h1>
      </div>
    );
  }

  const userIsEditor =
    session?.user &&
    organization.members.some(
      (member) => member.userId.equals(session.user?.id) && member.editor,
    );

  if (!userIsEditor) {
    return (
      <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4">
        <Breadcrumb>
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink href="/">Home</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink href="/orgs">{t("title")}</BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage>{organization.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <h1 className="tex-2xl">{t("Edit.forbidden")}</h1>
      </div>
    );
  }

  return (
    <div className="m-2 p-6 max-w-4xl mx-auto bg-white rounded-xl shadow-md space-y-4">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">Home</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/orgs">Organisations</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href={`/orgs/${organization._id}`}>
              {organization.name}
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Edition du profil</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <form className="space-y-4" action={updateOrgProfileAction}>
        <div className="grid w-full gap-4">
          <Input
            type="text"
            id="orgId"
            name="orgId"
            defaultValue={organization._id}
            className="hidden"
          />
          <div className="grid gap-2">
            <Label htmlFor="name" className="font-medium">
              {t("name")}
            </Label>
            <Input
              type="text"
              id="name"
              name="name"
              defaultValue={organization.name}
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="tag" className="font-medium">
              {t("tag")}
            </Label>
            <Input
              type="text"
              id="tag"
              name="tag"
              defaultValue={organization.tag}
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="avatar" className="font-medium">
              {t("avatar")}
            </Label>
            <Image
              src={organization.image}
              alt={`Logo de l'organization ${organization.name}`}
              height={200}
              width={200}
              priority={true}
            />
            <Input
              type="file"
              id="avatar"
              name="avatar"
              className="w-full px-3 py-2 border rounded-md"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="description" className="font-medium">
              {t("description")}
            </Label>
            <Textarea
              id="description"
              name="description"
              rows={5}
              defaultValue={organization.description}
              className="w-full px-3 py-2 border rounded-md resize-y"
            />
          </div>

          <Button type="submit" className="w-full">
            {t("Edit.save")}
          </Button>
        </div>
      </form>
    </div>
  );
}

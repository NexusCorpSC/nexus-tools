import Link from "next/link";
import {
  getUserRefiningJobs,
  RefiningJobWithTimeRemaining,
} from "@/lib/refining-jobs";
import { ObjectId } from "mongodb";
import { getTranslations } from "next-intl/server";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import NewJobForm from "./components/new-job-form";
import JobsList from "./components/jobs-list";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export default async function RefinePage() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  const t = await getTranslations("Refining");

  let jobs: RefiningJobWithTimeRemaining[] = [];
  if (session?.user?.id) {
    jobs = await getUserRefiningJobs(new ObjectId(session.user.id));
  }

  return (
    <div className="m-2 mx-auto max-w-7xl space-y-4 rounded-2xl border border-[#9ED0FF]/15 bg-[#0B3A5A]/60 p-6 shadow-xl shadow-black/20 backdrop-blur-sm">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink href="/">{t("home")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink href="/industry">{t("industry")}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{t("title")}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-2xl font-bold">{t("title")}</h1>
      <p className="text-nexus">
        {t("description")}
      </p>

      {session ? (
        <div className="mt-6 space-y-8">
          <div className="bg-nexus p-4 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">{t("addNewJob")}</h2>
            <NewJobForm />
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-4">{t("yourRefiningJobs")}</h2>
            <JobsList jobs={jobs} />
          </div>
        </div>
      ) : (
        <div className="mt-6 p-4 text-center bg-nexus rounded-lg">
          <p className="mb-4">{t("pleaseLogIn")}</p>
          <Link
            href="/login"
            className="text-blue-600 hover:text-blue-800 font-medium"
          >
            {t("logIn")}
          </Link>
        </div>
      )}
    </div>
  );
}

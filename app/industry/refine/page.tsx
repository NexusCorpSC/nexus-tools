import Link from "next/link";
import { auth } from "@/auth";
import { getUserRefiningJobs, RefiningJobWithTimeRemaining } from "@/lib/refining-jobs";
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

export default async function RefinePage() {
  const session = await auth();
  const t = await getTranslations("Refining");
  
  let jobs: RefiningJobWithTimeRemaining[] = [];
  if (session?.user?.id) {
    jobs = await getUserRefiningJobs(new ObjectId(session.user.id));
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
            <BreadcrumbLink href="/industry">Industry</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>Refining</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <h1 className="text-2xl font-bold">Refining Job Board</h1>
      <p className="text-gray-600">
        Manage your Star Citizen refining jobs - track progress and stay organized
      </p>
      
      {session ? (
        <div className="mt-6 space-y-8">
          <div className="bg-gray-50 p-4 rounded-lg">
            <h2 className="text-xl font-semibold mb-4">Add New Refining Job</h2>
            <NewJobForm />
          </div>
          
          <div>
            <h2 className="text-xl font-semibold mb-4">Your Refining Jobs</h2>
            <JobsList jobs={jobs} />
          </div>
        </div>
      ) : (
        <div className="mt-6 p-4 text-center bg-gray-50 rounded-lg">
          <p className="mb-4">Please log in to manage your refining jobs.</p>
          <Link href="/login" className="text-blue-600 hover:text-blue-800 font-medium">
            Log In
          </Link>
        </div>
      )}
    </div>
  );
}
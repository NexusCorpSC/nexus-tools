"use client";

import { useState } from "react";
import { RefiningJobWithTimeRemaining } from "@/lib/refining-jobs";
import { updateRefiningJob, deleteRefiningJob } from "../actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import { formatTimeRemaining } from "../utils";
import { DateTime } from "luxon";
import { useTranslations } from "next-intl";


interface JobsListProps {
  jobs: RefiningJobWithTimeRemaining[];
}

export default function JobsList({ jobs }: JobsListProps) {
  const [editingJob, setEditingJob] = useState<RefiningJobWithTimeRemaining | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const t = useTranslations("Refining");

  async function handleDelete(jobId: string) {
    try {
      await deleteRefiningJob(jobId);
      toast.success(t("deleteConfirmTitle"), {
        description: t("deleteConfirmDescription"),
      });
    } catch (error) {
      toast.error(t("deleteConfirmTitle"), {
        description: error instanceof Error ? error.message : t("deleteConfirmDescription"),
      });
    }
  }

  async function handleUpdate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingJob) return;

    setIsSubmitting(true);
    try {
      const formData = new FormData(event.currentTarget);
      formData.append("jobId", editingJob.id);
      
      await updateRefiningJob(formData);
      
      toast.success(t("editRefiningJobSuccessTitle"), {
        description: t("editRefiningJobSuccessDescription"),
      });
      
      setEditingJob(null);
    } catch (error) {
      toast.error(t("editRefiningJobErrorTitle"), {
        description: error instanceof Error ? error.message : t("editRefiningJobErrorDescription"),
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center py-8 bg-nexus rounded-lg">
        <p className="">{t("noRefiningJobs")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {jobs.map((job) => (
        <Card key={job.id} className={job.isFinished ? "border-green-300" : ""}>
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span>{job.location}</span>
              <span className={`text-sm px-3 py-1 rounded-full ${
                job.isFinished 
                  ? "bg-green-100 text-green-800" 
                  : "bg-blue-100 text-blue-800"
              }`}>
                {job.isFinished ? t("readyForCollection") : t("inProgress")}
              </span>
            </CardTitle>
            <CardDescription>
              {t("started")}: {DateTime.fromISO(job.startTime).toFormat('dd/MM/yyyy HH:mm')}
            </CardDescription> 
          </CardHeader>
          
          <CardContent>
            <div className="space-y-2">
              <h3 className="font-medium">{t("jobContent")}:</h3>
              <p className="">{job.content}</p>
              
              <div className="mt-4">
                <h3 className="font-medium">{t("timeRemaining")}:</h3>
                <div className="mt-1">
                  {job.isFinished ? (
                    <p className="text-green-600 font-medium">{t("readyForCollection")}</p>
                  ) : (
                    <>
                      <p>{formatTimeRemaining(job.timeRemaining)}</p>
                      <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                        <div 
                          className="bg-blue-600 h-2.5 rounded-full" 
                          style={{ 
                            width: `${Math.max(0, Math.min(100, 100 - (job.timeRemaining * 100 / job.duration)))}%` 
                          }}
                        ></div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
          
          <CardFooter className="justify-end space-x-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" onClick={() => setEditingJob(job)}>
                  {t("edit")}
                </Button>
              </DialogTrigger>
              
              {editingJob?.id === job.id && (
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{t("editRefiningJob")}</DialogTitle>
                    <DialogDescription>
                      {t("updateRefiningJobDetails")}
                    </DialogDescription>
                  </DialogHeader>
                  
                  <form onSubmit={handleUpdate} className="space-y-4 pt-4">
                    <div>
                      <label htmlFor="content" className="block text-sm font-medium">
                        {t("jobContent")}
                      </label>
                      <textarea
                        id="content"
                        name="content"
                        defaultValue={job.content}
                        rows={3}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-xs focus:outline-hidden focus:ring-primary focus:border-primary"
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="duration" className="block text-sm font-medium">
                        {t("duration")}
                      </label>
                      <input
                        type="number"
                        id="duration"
                        name="duration"
                        min="1"
                        defaultValue={job.duration}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-xs focus:outline-hidden focus:ring-primary focus:border-primary"
                      />
                    </div>
                    
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button type="button" variant="outline">{t("cancel")}</Button>
                      </DialogClose>
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? t("saving") : t("saveChanges")}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              )}
            </Dialog>
            
            <Button 
              variant="destructive" 
              size="sm"
              onClick={() => handleDelete(job.id)}
            >
              {t("delete")}
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
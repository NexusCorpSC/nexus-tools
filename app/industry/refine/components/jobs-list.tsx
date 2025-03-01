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


interface JobsListProps {
  jobs: RefiningJobWithTimeRemaining[];
}

export default function JobsList({ jobs }: JobsListProps) {
  const [editingJob, setEditingJob] = useState<RefiningJobWithTimeRemaining | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleDelete(jobId: string) {
    try {
      await deleteRefiningJob(jobId);
      toast.success("Job removed", {
        description: "The refining job has been removed successfully.",
      });
    } catch (error) {
      toast.error("Error", {
        description: error instanceof Error ? error.message : "Failed to delete job",
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
      
      toast.success("Job updated", {
        description: "Your refining job has been updated successfully.",
      });
      
      setEditingJob(null);
    } catch (error) {
      toast.error("Error", {
        description: error instanceof Error ? error.message : "Failed to update job",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  if (jobs.length === 0) {
    return (
      <div className="text-center py-8 bg-gray-50 rounded-lg">
        <p className="text-gray-500">No refining jobs yet. Add your first job above.</p>
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
                {job.isFinished ? "Completed" : "In Progress"}
              </span>
            </CardTitle>
            <CardDescription>
              Started: {DateTime.fromISO(job.startTime).toFormat('dd/MM/yyyy HH:mm')}
            </CardDescription> 
          </CardHeader>
          
          <CardContent>
            <div className="space-y-2">
              <h3 className="font-medium">Job Content:</h3>
              <p className="text-gray-700">{job.content}</p>
              
              <div className="mt-4">
                <h3 className="font-medium">Time Remaining:</h3>
                <div className="mt-1">
                  {job.isFinished ? (
                    <p className="text-green-600 font-medium">Ready for collection!</p>
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
                  Edit
                </Button>
              </DialogTrigger>
              
              {editingJob?.id === job.id && (
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit Refining Job</DialogTitle>
                    <DialogDescription>
                      Update the details of your refining job
                    </DialogDescription>
                  </DialogHeader>
                  
                  <form onSubmit={handleUpdate} className="space-y-4 pt-4">
                    <div>
                      <label htmlFor="content" className="block text-sm font-medium">
                        Job Content
                      </label>
                      <textarea
                        id="content"
                        name="content"
                        defaultValue={job.content}
                        rows={3}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
                      />
                    </div>
                    
                    <div>
                      <label htmlFor="duration" className="block text-sm font-medium">
                        Duration (minutes)
                      </label>
                      <input
                        type="number"
                        id="duration"
                        name="duration"
                        min="1"
                        defaultValue={job.duration}
                        className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary"
                      />
                    </div>
                    
                    <DialogFooter>
                      <DialogClose asChild>
                        <Button type="button" variant="outline">Cancel</Button>
                      </DialogClose>
                      <Button type="submit" disabled={isSubmitting}>
                        {isSubmitting ? "Saving..." : "Save Changes"}
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
              Remove
            </Button>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
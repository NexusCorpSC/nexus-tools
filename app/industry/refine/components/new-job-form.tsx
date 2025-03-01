"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { addRefiningJob } from "../actions";
import { toast } from "sonner";

// Parse duration string in format like "1d12h30m15s" to total minutes
function parseDuration(durationStr: string): number | null {
  // If it's just a number, return it directly
  if (/^\d+$/.test(durationStr)) {
    return parseInt(durationStr);
  }

  // Parse the complex format
  let totalMinutes = 0;
  
  // Match days
  const daysMatch = durationStr.match(/(\d+)d/);
  if (daysMatch) {
    totalMinutes += parseInt(daysMatch[1]) * 24 * 60; // days to minutes
  }
  
  // Match hours
  const hoursMatch = durationStr.match(/(\d+)h/);
  if (hoursMatch) {
    totalMinutes += parseInt(hoursMatch[1]) * 60; // hours to minutes
  }
  
  // Match minutes
  const minsMatch = durationStr.match(/(\d+)m/);
  if (minsMatch) {
    totalMinutes += parseInt(minsMatch[1]);
  }
  
  // Match seconds (convert to fractional minutes)
  const secsMatch = durationStr.match(/(\d+)s/);
  if (secsMatch) {
    totalMinutes += parseInt(secsMatch[1]) / 60;
  }
  
  // If nothing matched or calculated minutes is 0, return null
  if (totalMinutes === 0 && durationStr.trim() !== "0") {
    return null;
  }
  
  return Math.ceil(totalMinutes); // Round up to nearest minute
}

export default function NewJobForm() {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [durationInput, setDurationInput] = useState("");
  const [durationError, setDurationError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    
    try {
      const formData = new FormData(event.currentTarget);
      
      // Parse the duration string
      const durationStr = formData.get("duration") as string;
      const parsedDuration = parseDuration(durationStr);
      
      if (parsedDuration === null) {
        throw new Error("Invalid duration format. Use numbers for minutes or format like '1d12h30m15s'");
      }
      
      // Replace the duration in the form data
      formData.set("duration", parsedDuration.toString());
      
      const result = await addRefiningJob(formData);
      
      if (result.success) {
        toast.success("Job added", {
          description: "Your refining job has been added successfully.",
        });
        
        // Reset the form and state
        (event.target as HTMLFormElement).reset();
        setDurationInput("");
        setDurationError(null);
      }
    } catch (error) {
      toast.error("Error", {
        description: error instanceof Error ? error.message : "Failed to add refining job",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  // Validate duration input on change
  const handleDurationChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setDurationInput(value);
    
    if (value.trim() === "") {
      setDurationError(null);
      return;
    }
    
    const parsedDuration = parseDuration(value);
    if (parsedDuration === null) {
      setDurationError("Invalid format. Use minutes or format like '1d12h30m15s'");
    } else {
      setDurationError(null);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="location" className="block text-sm font-medium text-gray-700">
          Location
        </label>
        <input
          type="text"
          id="location"
          name="location"
          required
          placeholder="e.g., ARC-L1, New Babbage"
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>
      
      <div>
        <label htmlFor="content" className="block text-sm font-medium text-gray-700">
          Job Content
        </label>
        <textarea
          id="content"
          name="content"
          required
          placeholder="What materials are being refined?"
          rows={3}
          className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
        />
      </div>
      
      <div>
        <label htmlFor="duration" className="block text-sm font-medium text-gray-700">
          Duration
        </label>
        <input
          type="text"
          id="duration"
          name="duration"
          value={durationInput}
          onChange={handleDurationChange}
          required
          placeholder="e.g., 120 (minutes) or 2h (2 hours) or 1d12h30m (1 day, 12 hours, 30 minutes)"
          className={`mt-1 block w-full px-3 py-2 border ${
            durationError ? "border-red-500" : "border-gray-300"
          } rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500`}
        />
        {durationError && (
          <p className="mt-1 text-sm text-red-600">{durationError}</p>
        )}
        {durationInput && !durationError && parseDuration(durationInput) && (
          <p className="mt-1 text-sm text-green-600">
            Equivalent to {parseDuration(durationInput)} minutes
          </p>
        )}
      </div>
      
      <div className="flex justify-end">
        <Button type="submit" disabled={isSubmitting || !!durationError}>
          {isSubmitting ? "Adding..." : "Add Refining Job"}
        </Button>
      </div>
    </form>
  );
}
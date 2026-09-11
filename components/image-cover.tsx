"use client";

import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";

/**
 * Illustration of an entity, falling back to its initial when no image is
 * available or when the url fails to load.
 */
export function ImageCover({
  imageUrl,
  name,
  className,
  width = 896,
  height = 400,
  priority,
}: {
  imageUrl?: string;
  name: string;
  className?: string;
  width?: number;
  height?: number;
  priority?: boolean;
}) {
  const [failed, setFailed] = useState(false);

  if (!imageUrl || failed) {
    return (
      <span className="text-muted-foreground/40 text-5xl font-bold select-none">
        {name.charAt(0).toUpperCase()}
      </span>
    );
  }

  return (
    <Image
      src={imageUrl}
      alt={name}
      width={width}
      height={height}
      className={cn("w-full object-contain max-h-80", className)}
      priority={priority}
      onError={() => setFailed(true)}
    />
  );
}

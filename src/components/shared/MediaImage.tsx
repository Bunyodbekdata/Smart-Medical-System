"use client";

import React, { useState } from "react";
import Image from "next/image";

interface MediaImageProps {
  src: string;
  fallbackSrc?: string;
  alt: string;
  width: number;
  height: number;
  className?: string;
  priority?: boolean;
}

/**
 * Safe wrapper over next/image supporting local SVGs and arbitrary clinic-configured URLs
 * without runtime domain errors, plus automatic fallback on broken external URLs.
 */
export function MediaImage({
  src,
  fallbackSrc,
  alt,
  width,
  height,
  className,
  priority = false,
}: MediaImageProps) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const effectiveSrc = failedSrc === src && fallbackSrc ? fallbackSrc : src;
  const isSvgOrRemote =
    effectiveSrc.endsWith(".svg") ||
    effectiveSrc.startsWith("/api/media/") ||
    effectiveSrc.startsWith("/uploads/") ||
    effectiveSrc.startsWith("http://") ||
    effectiveSrc.startsWith("https://") ||
    effectiveSrc.startsWith("data:");

  return (
    <Image
      src={effectiveSrc}
      alt={alt}
      width={width}
      height={height}
      priority={priority}
      unoptimized={isSvgOrRemote}
      className={className}
      onError={() => {
        if (fallbackSrc && effectiveSrc !== fallbackSrc) {
          setFailedSrc(src);
        }
      }}
    />
  );
}

"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const GRADIENTS = [
  "from-cyan-500 to-blue-600",
  "from-violet-500 to-purple-600",
  "from-emerald-500 to-teal-600",
  "from-rose-500 to-pink-600",
  "from-amber-500 to-orange-600",
  "from-blue-500 to-violet-600",
  "from-pink-500 to-fuchsia-600",
  "from-teal-500 to-cyan-600",
];

function nameHash(name: string): number {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

type CreatorAvatarProps = {
  creator: {
    deso_public_key?: string | null;
    name: string;
    slug: string;
  };
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Pass eager=true for avatars above the fold (e.g. first visible row). Defaults to lazy. */
  eager?: boolean;
};

const SIZES = {
  sm: "h-8 w-8 text-xs",
  md: "h-10 w-10 text-sm",
  lg: "h-16 w-16 text-xl",
};

export function CreatorAvatar({ creator, size = "md", className, eager = false }: CreatorAvatarProps) {
  const [imgFailed, setImgFailed] = useState(false);
  const sizeClass = SIZES[size];
  const gradient = GRADIENTS[nameHash(creator.name) % GRADIENTS.length];

  // Route through our proxy — cached 24h server-side, never hits node.deso.org from the browser
  const picUrl = creator.deso_public_key
    ? `/api/avatar/${creator.deso_public_key}`
    : null;

  if (picUrl && !imgFailed) {
    return (
      <img
        src={picUrl}
        alt={creator.name}
        loading={eager ? "eager" : "lazy"}
        className={cn("rounded-full object-cover shrink-0", sizeClass, className)}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex items-center justify-center rounded-full bg-gradient-to-br font-bold text-white shrink-0",
        gradient,
        sizeClass,
        className
      )}
    >
      {creator.name.charAt(0).toUpperCase()}
    </div>
  );
}

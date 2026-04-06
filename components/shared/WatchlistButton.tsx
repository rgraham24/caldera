"use client";

import { useState } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store";

type WatchlistButtonProps = {
  entityType: "market" | "creator" | "user";
  entityId: string;
  initialWatched?: boolean;
  watchlistId?: string | null;
};

export function WatchlistButton({
  entityType,
  entityId,
  initialWatched = false,
  watchlistId: initialWatchlistId = null,
}: WatchlistButtonProps) {
  const [isWatched, setIsWatched] = useState(initialWatched);
  const [watchlistId, setWatchlistId] = useState(initialWatchlistId);
  const [isLoading, setIsLoading] = useState(false);
  const { isConnected } = useAppStore();

  const toggle = async () => {
    if (!isConnected) {
      window.location.href = "/login";
      return;
    }

    setIsLoading(true);
    try {
      if (isWatched && watchlistId) {
        await fetch(`/api/watchlist/${watchlistId}`, { method: "DELETE" });
        setIsWatched(false);
        setWatchlistId(null);
      } else {
        const res = await fetch("/api/watchlist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityType, entityId }),
        });
        if (res.ok) {
          const { data } = await res.json();
          setIsWatched(true);
          setWatchlistId(data.id);
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={toggle}
      disabled={isLoading}
      className={isWatched ? "text-caldera" : "text-text-muted hover:text-text-primary"}
    >
      {isWatched ? (
        <BookmarkCheck className="mr-1.5 h-4 w-4" />
      ) : (
        <Bookmark className="mr-1.5 h-4 w-4" />
      )}
      {isWatched ? "Watching" : "Watch"}
    </Button>
  );
}

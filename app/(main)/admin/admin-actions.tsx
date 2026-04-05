"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2 } from "lucide-react";

export function AdminActions() {
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const handleSync = async () => {
    setSyncing(true);
    setResult(null);
    try {
      const res = await fetch("/api/creators/sync-from-deso");
      const { data, error } = await res.json();
      if (error) throw new Error(error);
      setResult(`Synced ${data.synced} creators from DeSo blockchain`);
    } catch (err) {
      setResult(`Error: ${err instanceof Error ? err.message : "Sync failed"}`);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border-subtle bg-surface p-5">
      <h2 className="mb-3 text-sm font-semibold text-text-primary">DeSo Sync</h2>
      <p className="mb-4 text-xs text-text-muted">
        Pull the top creator profiles from the DeSo blockchain and update the database.
      </p>
      <Button
        onClick={handleSync}
        disabled={syncing}
        className="bg-caldera text-background font-semibold hover:bg-caldera/90"
      >
        {syncing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {syncing ? "Syncing..." : "Sync Creators from DeSo"}
      </Button>
      {result && (
        <p className={`mt-3 text-xs ${result.startsWith("Error") ? "text-no" : "text-yes"}`}>
          {result}
        </p>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import type { CommentWithUser } from "@/types";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/utils";

// Detect when the username is actually a DeSo pubkey (auth fallback when
// the user had no DeSo handle at signup) so we can shorten it for display.
function isDesoPubkey(s: string | null | undefined): boolean {
  return Boolean(s && s.startsWith("BC1") && s.length > 40);
}

function shortenPubkey(s: string): string {
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

type MarketCommentsProps = {
  marketId: string;
  initialComments: CommentWithUser[];
};

export function MarketComments({
  marketId,
  initialComments,
}: MarketCommentsProps) {
  const [comments, setComments] = useState(initialComments);
  const [body, setBody] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { isConnected } = useAppStore();

  const handleSubmit = async () => {
    if (!body.trim() || !isConnected) return;
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketId, body: body.trim() }),
      });

      if (!res.ok) {
        setError("Couldn't post comment. Try again.");
        return;
      }

      // Refetch the joined list rather than building an optimistic row —
      // the POST response is the raw market_comments row with no user join,
      // so prepending it locally was producing malformed CommentWithUser.
      setBody("");
      try {
        const listRes = await fetch(`/api/comments/${marketId}`, {
          credentials: "include",
        });
        if (listRes.ok) {
          const { data } = await listRes.json();
          if (Array.isArray(data)) {
            setComments(data as CommentWithUser[]);
          }
        }
      } catch {
        // Swallow — comment is saved server-side; next page load will show it.
      }
    } catch {
      setError("Couldn't post comment. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section>
      <h3 className="mb-4 font-display text-base font-semibold text-text-primary">
        Comments ({comments.length})
      </h3>

      {isConnected && (
        <div className="mb-6">
          <textarea
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Share your take..."
            rows={3}
            className="w-full rounded-lg border border-border-subtle bg-surface p-3 text-sm text-text-primary placeholder:text-text-faint focus:border-caldera focus:outline-none focus:ring-1 focus:ring-caldera resize-none"
          />
          {error && (
            <p className="mt-2 text-xs text-no">{error}</p>
          )}
          <div className="mt-2 flex justify-end">
            <Button
              size="sm"
              onClick={handleSubmit}
              disabled={!body.trim() || isSubmitting}
              className="bg-caldera text-white hover:bg-caldera/90"
            >
              {isSubmitting ? "Posting..." : "Post"}
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {comments.map((comment) => {
          // Prefer creator-row attribution when the commenter has a
          // matching creators row (by deso_public_key). Falls back to
          // users.username (which is the DeSo handle when set, or the
          // raw pubkey for handle-less users — we shorten the latter).
          const creator = comment.creator ?? null;
          const rawUsername = comment.user?.username ?? "";
          const fallbackName = isDesoPubkey(rawUsername)
            ? shortenPubkey(rawUsername)
            : rawUsername || "Anonymous";
          const displayName = creator?.name ?? fallbackName;
          const avatarUrl = creator?.image_url ?? comment.user?.avatar_url ?? null;
          const isVerified = !!creator || comment.user?.is_verified;
          const profileHref = creator ? `/creators/${creator.slug}` : null;

          const headerInner = (
            <>
              {avatarUrl ? (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={avatarUrl}
                  alt=""
                  className="h-6 w-6 rounded-full object-cover"
                />
              ) : (
                <div className="h-6 w-6 rounded-full bg-[var(--bg-elevated)]" />
              )}
              <span className="text-sm font-medium text-text-primary">
                {displayName}
              </span>
              {isVerified && (
                <span className="text-xs text-caldera">✓</span>
              )}
            </>
          );

          return (
            <div
              key={comment.id}
              className="rounded-lg border border-border-subtle bg-surface p-4"
            >
              <div className="mb-2 flex items-center gap-2">
                {profileHref ? (
                  <Link
                    href={profileHref}
                    className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                  >
                    {headerInner}
                  </Link>
                ) : (
                  <div className="flex items-center gap-2">{headerInner}</div>
                )}
                <span className="text-xs text-text-muted">
                  {formatRelativeTime(comment.created_at ?? "")}
                </span>
              </div>
              <p className="text-sm text-text-primary leading-relaxed">
                {comment.body}
              </p>
            </div>
          );
        })}
        {comments.length === 0 && (
          <p className="text-center text-sm text-text-muted py-8">
            No comments yet. Be the first to share your take.
          </p>
        )}
      </div>
    </section>
  );
}

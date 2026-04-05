"use client";

import { useState } from "react";
import type { CommentWithUser } from "@/types";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/utils";

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
  const { isAuthenticated, user } = useAppStore();

  const handleSubmit = async () => {
    if (!body.trim() || !isAuthenticated) return;
    setIsSubmitting(true);

    try {
      const res = await fetch("/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketId, body: body.trim() }),
      });

      if (res.ok) {
        const { data } = await res.json();
        setComments((prev) => [
          {
            ...data,
            user: {
              id: user!.id,
              username: user!.username,
              avatar_url: user!.avatar_url,
              is_verified: user!.is_verified,
            },
          },
          ...prev,
        ]);
        setBody("");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section>
      <h3 className="mb-4 font-display text-base font-semibold text-text-primary">
        Comments ({comments.length})
      </h3>

      {isAuthenticated && (
        <div className="mb-6">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Share your take..."
            rows={3}
            className="w-full rounded-lg border border-border-subtle bg-surface p-3 text-sm text-text-primary placeholder:text-text-faint focus:border-caldera focus:outline-none focus:ring-1 focus:ring-caldera resize-none"
          />
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
        {comments.map((comment) => (
          <div
            key={comment.id}
            className="rounded-lg border border-border-subtle bg-surface p-4"
          >
            <div className="mb-2 flex items-center gap-2">
              {comment.user.avatar_url && (
                <img
                  src={comment.user.avatar_url}
                  alt=""
                  className="h-6 w-6 rounded-full"
                />
              )}
              <span className="text-sm font-medium text-text-primary">
                {comment.user.username}
              </span>
              {comment.user.is_verified && (
                <span className="text-xs text-caldera">✓</span>
              )}
              <span className="text-xs text-text-muted">
                {formatRelativeTime(comment.created_at)}
              </span>
            </div>
            <p className="text-sm text-text-primary leading-relaxed">
              {comment.body}
            </p>
          </div>
        ))}
        {comments.length === 0 && (
          <p className="text-center text-sm text-text-muted py-8">
            No comments yet. Be the first to share your take.
          </p>
        )}
      </div>
    </section>
  );
}

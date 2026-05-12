import { isCreatorVerified } from "@/lib/creators/validity";

/**
 * Verified-creator blue check. Single-tier — no gold, no purple. Sourced
 * from is_bitclout_original (the BitClout-original reserved-username
 * list, ~14k profiles) or verification_status = 'approved' (manually
 * approved by a Caldera admin). claim_status is intentionally NOT a
 * signal here — claiming is wallet ownership, not identity verification.
 *
 * Returns null if the creator is not verified. No gray fallback — empty
 * is the clean negative.
 */

type VerificationBadgeProps = {
  creator: {
    is_bitclout_original?: boolean | null;
    verification_status?: string | null;
    // claim_status is accepted for back-compat with callers that already
    // spread a full Creator object, but is not consulted by the rule.
    claim_status?: string | null;
  };
  size?: "sm" | "md";
};

export function VerificationBadge({ creator, size = "sm" }: VerificationBadgeProps) {
  if (!isCreatorVerified(creator)) return null;

  const dim =
    size === "sm" ? "h-3.5 w-3.5 text-[9px]" : "h-4 w-4 text-[10px]";

  return (
    <span className="relative group inline-flex shrink-0">
      <span
        className={`inline-flex items-center justify-center rounded-full bg-[#2fa6ff]/20 text-[#2fa6ff] font-bold cursor-help ${dim}`}
      >
        ✓
      </span>
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 hidden whitespace-nowrap rounded-md border border-border-subtle bg-surface-2 px-2 py-1 shadow-xl group-hover:block">
        <span className="block text-[11px] text-text-primary">Verified creator</span>
      </span>
    </span>
  );
}

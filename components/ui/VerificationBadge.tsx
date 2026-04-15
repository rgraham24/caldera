export function VerificationBadge({
  isReserved,
  isCalderaVerified,
}: {
  isReserved?: boolean;
  isCalderaVerified?: boolean;
}) {
  if (isReserved) {
    return (
      <span className="relative group inline-flex shrink-0">
        <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-yellow-400/20 text-yellow-400 text-[10px] font-bold cursor-help">✓</span>
        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 hidden group-hover:block w-56 rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 shadow-xl">
          <span className="block text-[11px] font-semibold text-yellow-400 mb-1">DeSo Reserved Profile</span>
          <span className="block text-[11px] text-text-muted leading-relaxed">This profile was reserved by DeSo for a real public figure. The handle is protected and can only be claimed by the actual person or their team.</span>
        </span>
      </span>
    );
  }
  if (isCalderaVerified) {
    return (
      <span className="relative group inline-flex shrink-0">
        <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-caldera/20 text-caldera text-[10px] font-bold cursor-help">✓</span>
        <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 hidden group-hover:block w-56 rounded-lg border border-border-subtle bg-surface-2 px-3 py-2 shadow-xl">
          <span className="block text-[11px] font-semibold text-caldera mb-1">Caldera Verified</span>
          <span className="block text-[11px] text-text-muted leading-relaxed">This profile has been verified by the Caldera team as the authentic account for this person or brand.</span>
        </span>
      </span>
    );
  }
  return null;
}

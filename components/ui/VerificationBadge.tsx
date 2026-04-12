export function VerificationBadge({
  isReserved,
  isCalderaVerified,
}: {
  isReserved?: boolean;
  isCalderaVerified?: boolean;
}) {
  if (isReserved) {
    return (
      <span
        title="DeSo Reserved Profile — verified by DeSo"
        className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-yellow-400/20 text-yellow-400 text-[10px] font-bold shrink-0"
      >
        ✓
      </span>
    );
  }
  if (isCalderaVerified) {
    return (
      <span
        title="Caldera Verified"
        className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-caldera/20 text-caldera text-[10px] font-bold shrink-0"
      >
        ✓
      </span>
    );
  }
  return null;
}

"use client";

type InfoTooltipProps = {
  text: string;
};

export function InfoTooltip({ text }: InfoTooltipProps) {
  return (
    <span className="group relative inline-flex cursor-help">
      <span className="text-text-faint hover:text-text-muted text-[13px] ml-0.5">ⓘ</span>
      <span className="invisible group-hover:visible absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-[260px] rounded-xl bg-[#0f1e38] border border-[#1a3a5c] p-3 text-[13px] leading-[1.6] text-text-muted shadow-xl z-50 transition-opacity duration-150">
        {text}
        <span className="absolute top-full left-1/2 -translate-x-1/2 -mt-px h-2 w-2 rotate-45 bg-[#0f1e38] border-r border-b border-[#1a3a5c]" />
      </span>
    </span>
  );
}

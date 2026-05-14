import { TopNav } from "@/components/layout/TopNav";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { Footer } from "@/components/layout/Footer";
import { DepositModalRoot } from "@/components/deposit/DepositModalRoot";
import { WelcomeBanner } from "@/components/layout/WelcomeBanner";
import StarterBanner from "@/components/shared/StarterBanner";
import { LiveTicker } from "./_components/ticker/LiveTicker";
import { FollowGraphHydrator } from "@/components/shared/FollowGraphHydrator";
import { SearchOverlayRoot } from "@/components/search/SearchOverlayRoot";
// TEMPORARY (2026-05-14): per-sibling boundaries to identify which
// layout child throws React #310 on mobile Safari. Revert this import +
// the wrappers below once the culprit is found.
import { NamedErrorBoundary } from "@/components/diagnostic/NamedErrorBoundary";
import dynamic from "next/dynamic";

// Heavy modals — only needed when triggered, never on initial render
const HowItWorksModal = dynamic(
  () => import("@/components/how-it-works-modal").then((m) => ({ default: m.HowItWorksModal }))
);
export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      {/* Bloomberg-style sticky-top live ticker. Stacks with TopNav:
          ticker sticks at top:0 z-50, TopNav sticks at top-[50px] z-40.
          Full-bleed, edge-to-edge, with a 1px bottom border separator
          from the nav. */}
      <div className="sticky top-0 z-50 w-full">
        <NamedErrorBoundary name="LiveTicker">
          <LiveTicker />
        </NamedErrorBoundary>
      </div>
      <NamedErrorBoundary name="TopNav">
        <TopNav />
      </NamedErrorBoundary>
      <NamedErrorBoundary name="WelcomeBanner">
        <WelcomeBanner />
      </NamedErrorBoundary>
      <NamedErrorBoundary name="StarterBanner">
        <StarterBanner />
      </NamedErrorBoundary>
      <main className="flex-1 overflow-x-hidden pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0">
        <NamedErrorBoundary name="children">
          {children}
        </NamedErrorBoundary>
      </main>
      <NamedErrorBoundary name="Footer">
        <Footer />
      </NamedErrorBoundary>
      <NamedErrorBoundary name="MobileTabBar">
        <MobileTabBar />
      </NamedErrorBoundary>
      <NamedErrorBoundary name="DepositModalRoot">
        <DepositModalRoot />
      </NamedErrorBoundary>
      <NamedErrorBoundary name="HowItWorksModal">
        <HowItWorksModal />
      </NamedErrorBoundary>
      <NamedErrorBoundary name="FollowGraphHydrator">
        <FollowGraphHydrator />
      </NamedErrorBoundary>
      <NamedErrorBoundary name="SearchOverlayRoot">
        <SearchOverlayRoot />
      </NamedErrorBoundary>
    </>
  );
}

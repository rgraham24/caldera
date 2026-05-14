import { TopNav } from "@/components/layout/TopNav";
import { MobileTabBar } from "@/components/layout/MobileTabBar";
import { Footer } from "@/components/layout/Footer";
import { DepositModalRoot } from "@/components/deposit/DepositModalRoot";
import { WelcomeBanner } from "@/components/layout/WelcomeBanner";
import StarterBanner from "@/components/shared/StarterBanner";
import { LiveTicker } from "./_components/ticker/LiveTicker";
import { FollowGraphHydrator } from "@/components/shared/FollowGraphHydrator";
import { SearchOverlayRoot } from "@/components/search/SearchOverlayRoot";
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
        <LiveTicker />
      </div>
      <TopNav />
      <WelcomeBanner />
      <StarterBanner />
      <main className="flex-1 overflow-x-hidden pb-[calc(64px+env(safe-area-inset-bottom))] md:pb-0">
        {children}
      </main>
      <Footer />
      <MobileTabBar />
      <DepositModalRoot />
      <HowItWorksModal />
      <FollowGraphHydrator />
      <SearchOverlayRoot />
    </>
  );
}

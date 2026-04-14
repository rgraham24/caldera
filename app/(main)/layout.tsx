import { TopNav } from "@/components/layout/TopNav";
import { MobileNav } from "@/components/layout/MobileNav";
import { Footer } from "@/components/layout/Footer";
import { DepositModalRoot } from "@/components/deposit/DepositModalRoot";
import { WelcomeBanner } from "@/components/layout/WelcomeBanner";
import StarterBanner from "@/components/shared/StarterBanner";
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
      <TopNav />
      <WelcomeBanner />
      <StarterBanner />
      <main className="flex-1 overflow-x-hidden pb-16 md:pb-0">{children}</main>
      <Footer />
      <MobileNav />
      <DepositModalRoot />
      <HowItWorksModal />
    </>
  );
}

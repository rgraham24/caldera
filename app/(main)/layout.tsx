import { TopNav } from "@/components/layout/TopNav";
import { MobileNav } from "@/components/layout/MobileNav";
import { Footer } from "@/components/layout/Footer";
import { DepositModalRoot } from "@/components/deposit/DepositModalRoot";
import { WelcomeBanner } from "@/components/layout/WelcomeBanner";
import StarterBanner from "@/components/shared/StarterBanner";
import { StoreHydration } from "@/components/providers/StoreHydration";

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <StoreHydration />
      <TopNav />
      <WelcomeBanner />
      <StarterBanner />
      <main className="flex-1 pb-16 md:pb-0">{children}</main>
      <Footer />
      <MobileNav />
      <DepositModalRoot />
    </>
  );
}

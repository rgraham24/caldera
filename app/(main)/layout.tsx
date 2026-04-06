import { TopNav } from "@/components/layout/TopNav";
import { MobileNav } from "@/components/layout/MobileNav";
import { Footer } from "@/components/layout/Footer";
import { DepositModalRoot } from "@/components/deposit/DepositModalRoot";
import { WelcomeBanner } from "@/components/layout/WelcomeBanner";
import StarterBanner from "@/components/shared/StarterBanner";

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
      <main className="flex-1 pb-16 md:pb-0">{children}</main>
      <Footer />
      <MobileNav />
      <DepositModalRoot />
    </>
  );
}

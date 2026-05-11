/**
 * /more — drawer-style navigation hub for mobile.
 *
 * Houses everything that didnt get primary bottom-tab status: per-user
 * surfaces (Following / Portfolio / Leaderboard), learn (How it works /
 * About), community (X), and legal (Terms).
 *
 * The 'How it works' row triggers the existing HowItWorks modal via the
 * 'show-hiw-modal' CustomEvent that TopNav already listens for, so the
 * row needs to be in a client component.
 *
 * On desktop, the page is md:hidden — desktop users navigate via the
 * top tabs and never see this surface. Route still exists so deep
 * links work.
 */

import { MorePageClient } from "./more-client";

export default function MorePage() {
  return <MorePageClient />;
}

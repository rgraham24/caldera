import { createClient } from "@/lib/supabase/server";
import { CreatorsClient } from "@/app/(main)/creators/creators-client";
import type { Creator } from "@/types";

export default async function TokensPage() {
  const supabase = await createClient();
  const { data: creators } = await supabase
    .from("creators")
    .select("*")
    .order("creator_coin_price", { ascending: false });

  return (
    <div>
      <div className="mx-auto max-w-7xl px-4 pt-8 pb-4 md:px-6 lg:px-8">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">💰 Token Markets</h1>
        <p className="mt-1 text-sm text-[var(--text-tertiary)]">
          The top creator coins by price and momentum
        </p>
      </div>
      <CreatorsClient creators={(creators ?? []) as Creator[]} />
    </div>
  );
}

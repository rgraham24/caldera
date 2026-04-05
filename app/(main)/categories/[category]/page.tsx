import { createClient } from "@/lib/supabase/server";
import { CATEGORIES } from "@/types";
import { notFound } from "next/navigation";
import { MarketGrid } from "@/components/markets/MarketGrid";

export default async function CategoryPage({
  params,
}: {
  params: Promise<{ category: string }>;
}) {
  const { category } = await params;

  const validCategory = CATEGORIES.find((c) => c.value === category);
  if (!validCategory) notFound();

  const supabase = await createClient();

  const { data: markets } = await supabase
    .from("markets")
    .select("*")
    .eq("category", category)
    .order("trending_score", { ascending: false });

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 md:px-6 lg:px-8">
      <h1 className="mb-6 font-display text-2xl font-bold text-text-primary">
        {validCategory.label}
      </h1>
      <MarketGrid markets={markets ?? []} />
    </div>
  );
}

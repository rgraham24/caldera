"use client";

import { CATEGORIES } from "@/types";
import { CategoryPill } from "@/components/shared/CategoryPill";

type CategoryRowProps = {
  activeCategory: string | null;
  onCategoryChange: (category: string | null) => void;
};

export function CategoryRow({
  activeCategory,
  onCategoryChange,
}: CategoryRowProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <CategoryPill
        category="All"
        active={activeCategory === null}
        onClick={() => onCategoryChange(null)}
      />
      {CATEGORIES.map((cat) => (
        <CategoryPill
          key={cat.value}
          category={cat.label}
          active={activeCategory === cat.value}
          onClick={() => onCategoryChange(cat.value)}
        />
      ))}
    </div>
  );
}

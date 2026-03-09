"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type CategoryData = { category: string; subcategories: string[] };

function AutocompleteInput({
  id,
  name,
  required,
  suggestions,
  placeholder,
  value,
  onChange,
}: {
  id: string;
  name: string;
  required?: boolean;
  suggestions: string[];
  placeholder?: string;
  value: string;
  onChange: (val: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = suggestions.filter((s) =>
    s.toLowerCase().includes(value.toLowerCase()),
  );
  const showList = open && filtered.length > 0 && value.length > 0;

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <Input
        id={id}
        name={name}
        required={required}
        placeholder={placeholder}
        value={value}
        autoComplete="off"
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />
      {showList && (
        <ul className="absolute z-20 mt-1 w-full rounded-md border border-gray-200 bg-white shadow-lg max-h-48 overflow-y-auto divide-y divide-gray-100">
          {filtered.map((s) => (
            <li
              key={s}
              className="px-3 py-2 text-sm text-gray-800 cursor-pointer hover:bg-gray-50"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(s);
                setOpen(false);
              }}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CategoryInputs({
  tCategory,
  tSubcategory,
  initialCategory = "",
  initialSubcategory = "",
}: {
  tCategory: string;
  tSubcategory: string;
  initialCategory?: string;
  initialSubcategory?: string;
}) {
  const [data, setData] = useState<CategoryData[]>([]);
  const [category, setCategory] = useState(initialCategory);
  const [subcategory, setSubcategory] = useState(initialSubcategory);

  useEffect(() => {
    fetch("/api/blueprints/categories")
      .then((r) => r.json())
      .then(setData)
      .catch(() => setData([]));
  }, []);

  const categories = data.map((d) => d.category);
  const subcategories =
    data.find((d) => d.category === category)?.subcategories ?? [];

  // Reset subcategory when category changes
  function handleCategoryChange(val: string) {
    setCategory(val);
    setSubcategory("");
  }

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="category">{tCategory}</Label>
        <AutocompleteInput
          id="category"
          name="category"
          required
          suggestions={categories}
          value={category}
          onChange={handleCategoryChange}
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="subcategory">{tSubcategory}</Label>
        <AutocompleteInput
          id="subcategory"
          name="subcategory"
          suggestions={subcategories}
          value={subcategory}
          onChange={setSubcategory}
        />
      </div>
    </>
  );
}

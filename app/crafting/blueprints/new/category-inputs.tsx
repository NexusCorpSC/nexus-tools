"use client";

import { useState, useEffect } from "react";
import { Label } from "@/components/ui/label";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@/components/ui/combobox";

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
  const [inputValue, setInputValue] = useState(value);

  // Keep local input in sync when parent value changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  const filtered = suggestions.filter((s) =>
    s.toLowerCase().includes(inputValue.toLowerCase()),
  );

  return (
    <Combobox
      value={value}
      onValueChange={(val) => {
        const v = val ?? "";
        onChange(v);
        setInputValue(v);
      }}
    >
      <ComboboxInput
        id={id}
        name={name}
        required={required}
        placeholder={placeholder}
        autoComplete="off"
        showTrigger={false}
        value={inputValue}
        onChange={(e) => {
          const v = e.target.value;
          setInputValue(v);
          onChange(v);
        }}
      />
      <ComboboxContent>
        <ComboboxList>
          <ComboboxEmpty />
          {filtered.map((s) => (
            <ComboboxItem key={s} value={s}>
              {s}
            </ComboboxItem>
          ))}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
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

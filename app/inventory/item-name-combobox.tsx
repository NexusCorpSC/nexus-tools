"use client";

import {
  ClipboardEvent,
  KeyboardEvent,
  Ref,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslations } from "next-intl";
import { CubeIcon } from "@heroicons/react/24/outline";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ItemListResponse, ItemSummary } from "@/types/items";

/** Case and accents aside, as a player types an object's name. */
function fold(text: string) {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

/** Below this, the catalogue matches too much to be worth asking. */
const MIN_REMOTE_QUERY = 2;
/** Beyond this, typing more narrows the list faster than scrolling it. */
const MAX_SUGGESTIONS = 50;

type Suggestion = { name: string; held: boolean; kind?: ItemSummary["kind"] };

/**
 * An object's name, typed freely, with the names already known offered as
 * the reader types: those they already hold first, then every object of the
 * game `/api/items` finds. A name matching none is kept as typed.
 *
 * Nothing is highlighted until an arrow key is pressed, so Enter keeps its
 * meaning for the form around: the next row of the quick-add table, or
 * submitting the dialog.
 */
export function ItemNameCombobox({
  value,
  onChange,
  held = [],
  inputRef,
  id,
  placeholder,
  className,
  invalid,
  required,
  autoFocus,
  onPaste,
  "aria-label": ariaLabel,
}: {
  value: string;
  onChange: (name: string) => void;
  /** Names of what the reader already holds. */
  held?: string[];
  inputRef?: Ref<HTMLInputElement>;
  id?: string;
  placeholder?: string;
  className?: string;
  invalid?: boolean;
  required?: boolean;
  autoFocus?: boolean;
  onPaste?: (e: ClipboardEvent<HTMLInputElement>) => void;
  "aria-label"?: string;
}) {
  const t = useTranslations("Inventory");
  const tItems = useTranslations("Items");
  const listId = useId();
  const listRef = useRef<HTMLDivElement>(null);

  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);

  const typed = value.trim();
  const remoteSearch =
    open && typed.length >= MIN_REMOTE_QUERY
      ? new URLSearchParams({
          query: typed,
          limit: String(MAX_SUGGESTIONS),
        }).toString()
      : null;

  // The results shown are those served for a search: an answer to one the
  // reader has typed past is dropped.
  const [served, setServed] = useState<{
    search: string | null;
    items: ItemSummary[];
  }>({ search: null, items: [] });

  useEffect(() => {
    if (!remoteSearch) return;
    let current = true;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/items?${remoteSearch}`);
        if (!res.ok) return;
        const data: ItemListResponse = await res.json();
        if (current) setServed({ search: remoteSearch, items: data.items });
      } catch {
        // Only the names already held are offered.
      }
    }, 200);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [remoteSearch]);

  const suggestions = useMemo<Suggestion[]>(() => {
    const needle = fold(typed);
    if (!needle) return held.map((name) => ({ name, held: true }));

    const byName = new Map<string, Suggestion>();
    for (const name of held) {
      if (fold(name).includes(needle)) {
        byName.set(fold(name), { name, held: true });
      }
    }
    // The API also matches descriptions and makers: only names count here.
    // While a newer search is on its way, the last answer still narrows down.
    const remote = typed.length >= MIN_REMOTE_QUERY ? served.items : [];
    for (const item of remote) {
      const key = fold(item.name);
      if (!byName.has(key) && key.includes(needle)) {
        byName.set(key, { name: item.name, held: false, kind: item.kind });
      }
    }

    // A name starting with what is typed comes before one merely holding it.
    const starts = (s: Suggestion) => (fold(s.name).startsWith(needle) ? 0 : 1);
    return [...byName.values()]
      .sort(
        (a, b) =>
          Number(b.held) - Number(a.held) ||
          starts(a) - starts(b) ||
          a.name.localeCompare(b.name),
      )
      .slice(0, MAX_SUGGESTIONS);
  }, [typed, held, served.items]);

  // Only the name exactly as typed left: nothing to offer.
  const visible =
    open &&
    suggestions.length > 0 &&
    !(suggestions.length === 1 && suggestions[0].name === typed);

  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${highlighted}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  function pick(name: string) {
    onChange(name);
    setOpen(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!visible) {
        setOpen(true);
        return;
      }
      const step = e.key === "ArrowDown" ? 1 : -1;
      setHighlighted((current) =>
        current < 0 && step < 0
          ? suggestions.length - 1
          : (current + step + suggestions.length) % suggestions.length,
      );
      return;
    }
    const option = visible ? suggestions[highlighted] : undefined;
    if (e.key === "Enter" && option && !e.ctrlKey && !e.metaKey) {
      // Picking a name is not moving to the next row, nor submitting.
      e.preventDefault();
      e.stopPropagation();
      pick(option.name);
      return;
    }
    if (e.key === "Tab" && option) {
      pick(option.name);
      return;
    }
    if (e.key === "Escape" && visible) {
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
    }
  }

  const activeId =
    visible && highlighted >= 0 ? `${listId}-${highlighted}` : undefined;

  return (
    <div className="relative">
      <Input
        ref={inputRef}
        id={id}
        role="combobox"
        aria-expanded={visible}
        aria-controls={listId}
        aria-activedescendant={activeId}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        required={required}
        value={value}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e.target.value);
          // A new text is a new list: nothing highlighted in it yet.
          setHighlighted(-1);
          setOpen(true);
        }}
        onPaste={onPaste}
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        className={className}
      />
      {visible && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={ariaLabel}
          className="absolute z-50 mt-1 max-h-60 w-full min-w-64 overflow-auto rounded-lg border border-[#9ED0FF]/25 bg-popover py-1 text-popover-foreground shadow-xl shadow-black/40"
        >
          {suggestions.map((suggestion, index) => (
            <div
              key={suggestion.name}
              id={`${listId}-${index}`}
              data-index={index}
              role="option"
              aria-selected={index === highlighted}
              // The field keeps the focus: a click must not blur it first.
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlighted(index)}
              onClick={() => pick(suggestion.name)}
              className={cn(
                "flex cursor-pointer items-center gap-2 px-3 py-2 text-sm",
                index === highlighted && "bg-[#9ED0FF]/10",
              )}
            >
              <CubeIcon
                className={cn(
                  "size-4 shrink-0",
                  suggestion.held ? "text-[#9ED0FF]" : "text-[#7E9FB7]",
                )}
              />
              <span className="truncate">{suggestion.name}</span>
              <span className="ml-auto shrink-0 pl-2 text-xs text-[#7E9FB7]">
                {suggestion.held
                  ? t("itemNameHeld")
                  : suggestion.kind
                    ? tItems(`kinds.${suggestion.kind}`)
                    : null}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

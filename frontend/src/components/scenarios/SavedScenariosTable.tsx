"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ConfirmDialog, DialogList, TrashIcon } from "@/components/common/ConfirmDialog";
import type { SavedScenario } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatAxisCurrency, formatCurrency } from "@/lib/utils/formatting";

type SortKey = "newest" | "oldest" | "savings" | "name";

interface SavedScenariosTableProps {
  scenarios: SavedScenario[];
  /** Called once the person has confirmed; the page handles undo and the real request. */
  onDelete: (ids: string[]) => void;
}

const ROW_GRID =
  "grid grid-cols-[44px_minmax(0,1fr)_52px] md:grid-cols-[48px_minmax(0,2.6fr)_minmax(0,1.4fr)_minmax(0,1.1fr)_minmax(0,0.8fr)_minmax(0,1.1fr)_minmax(0,1fr)_92px]";

export function savedHref(id: string) {
  return `/calculator?saved=${id}`;
}

export function formatSavedDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function sortScenarios(list: SavedScenario[], sort: SortKey) {
  const sorted = list.slice();
  if (sort === "oldest") sorted.sort((a, b) => a.created_at.localeCompare(b.created_at));
  else if (sort === "savings") sorted.sort((a, b) => b.estimated_savings - a.estimated_savings);
  else if (sort === "name") sorted.sort((a, b) => a.name.localeCompare(b.name));
  else sorted.sort((a, b) => b.created_at.localeCompare(a.created_at));
  return sorted;
}

function isJoint(s: SavedScenario) {
  return s.filing_status === "married_filing_jointly";
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function RowMenu({
  scenario,
  onClose,
  onDelete,
}: {
  scenario: SavedScenario;
  onClose: () => void;
  onDelete: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      // Clicks on the row's own toggle are handled by the toggle.
      if (!ref.current?.parentElement?.contains(target)) onClose();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [onClose]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
    const at = items.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      items[(at + 1) % items.length]?.focus();
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      items[(at - 1 + items.length) % items.length]?.focus();
    }
  };

  const itemClass =
    "flex h-11 items-center gap-2.5 rounded-sm px-2.5 text-left text-body-sm text-text-primary no-underline transition-colors duration-150 hover:bg-paper-warm focus:bg-paper-warm focus:outline-none md:h-9";

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={`More actions for ${scenario.name}`}
      onKeyDown={onKeyDown}
      className="absolute right-3 top-[calc(100%-6px)] z-20 flex w-[220px] flex-col rounded-[12px] border border-border bg-white p-1.5 shadow-elevated"
    >
      <Link role="menuitem" href={savedHref(scenario.id)} className={itemClass}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="shrink-0 text-text-tertiary"
        >
          <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
        Re-run in calculator
      </Link>
      <div role="separator" className="-mx-1.5 my-1.5 h-px bg-border" />
      <button
        type="button"
        role="menuitem"
        onClick={onDelete}
        className={cn(itemClass, "text-negative hover:bg-negative/10 focus:bg-negative/10")}
      >
        <TrashIcon />
        Delete…
      </button>
    </div>
  );
}

/**
 * The saved-scenarios list: search, sort, a row per scenario with its key facts, a
 * per-row actions menu, and checkboxes for deleting several at once. On phones the
 * secondary columns drop and their facts move under the name.
 */
export function SavedScenariosTable({ scenarios, onDelete }: SavedScenariosTableProps) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("newest");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirmIds, setConfirmIds] = useState<string[] | null>(null);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matching = q ? scenarios.filter((s) => s.name.toLowerCase().includes(q)) : scenarios;
    return sortScenarios(matching, sort);
  }, [scenarios, query, sort]);

  // Drop selections for scenarios that are gone (deleted, or undone back in).
  const present = new Set(scenarios.map((s) => s.id));
  const selectedIds = Array.from(selected).filter((id) => present.has(id));
  const allChecked = rows.length > 0 && rows.every((r) => selected.has(r.id));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      rows.forEach((r) => (allChecked ? next.delete(r.id) : next.add(r.id)));
      return next;
    });

  const confirmItems = (confirmIds ?? [])
    .map((id) => scenarios.find((s) => s.id === id))
    .filter((s): s is SavedScenario => Boolean(s));
  const many = confirmItems.length > 1;

  const confirm = () => {
    const ids = confirmItems.map((s) => s.id);
    setConfirmIds(null);
    setSelected((prev) => {
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
    onDelete(ids);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2.5">
        <label className="relative min-w-0 flex-[1_1_100%] md:max-w-[360px] md:flex-[1_1_260px]">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-muted">
            <SearchIcon />
          </span>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search scenarios"
            aria-label="Search scenarios"
            className="h-11 w-full rounded-[10px] border border-border bg-white pl-10 pr-3.5 text-body-sm text-text-primary outline-none transition-[border-color,box-shadow] duration-200 placeholder:text-ink-muted focus:border-pine focus:ring-2 focus:ring-pine-mid/15"
          />
        </label>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          aria-label="Sort scenarios"
          className="h-11 appearance-none rounded-[10px] border border-border bg-white bg-[url('data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20width=%2712%27%20height=%2712%27%20fill=%27none%27%20stroke=%27%23737373%27%20stroke-width=%271.6%27%20stroke-linecap=%27round%27%20stroke-linejoin=%27round%27%3E%3Cpath%20d=%27M3%204.5l3%203%203-3%27/%3E%3C/svg%3E')] bg-[position:right_14px_center] bg-no-repeat pl-3.5 pr-9 text-body-sm text-text-primary outline-none focus:border-pine focus:ring-2 focus:ring-pine-mid/15"
        >
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="savings">Highest savings</option>
          <option value="name">Name, A to Z</option>
        </select>
      </div>

      <div
        role="table"
        aria-label="Saved scenarios"
        className="rounded-md border border-border bg-white shadow-[0_24px_60px_-34px_rgba(27,67,50,0.22)]"
      >
        <div role="rowgroup">
          <div
            role="row"
            className={cn(
              ROW_GRID,
              "min-h-[44px] items-center rounded-t-md bg-paper text-[12px] font-medium tracking-[0.01em] text-text-tertiary"
            )}
          >
            <div role="columnheader" className="flex items-center justify-center px-3">
              <input
                type="checkbox"
                className="h-4 w-4 cursor-pointer accent-pine"
                aria-label="Select all scenarios"
                checked={allChecked}
                onChange={toggleAll}
              />
            </div>
            <div role="columnheader" className="px-3">
              Name
            </div>
            <div role="columnheader" className="hidden px-3 md:block">
              Filing status
            </div>
            <div role="columnheader" className="hidden px-3 text-right md:block">
              IRA balance
            </div>
            <div role="columnheader" className="hidden px-3 text-right md:block">
              Horizon
            </div>
            <div role="columnheader" className="hidden px-3 text-right md:block">
              Est. tax savings
            </div>
            <div role="columnheader" className="hidden px-3 md:block">
              Saved
            </div>
            <div role="columnheader" className="px-3">
              <span className="sr-only">Actions</span>
            </div>
          </div>
        </div>

        <div role="rowgroup">
          {rows.map((s, i) => {
            const checked = selected.has(s.id);
            const menuOpen = menuId === s.id;
            const savings = s.estimated_savings > 0 ? s.estimated_savings : 0;
            return (
              <div
                key={s.id}
                role="row"
                className={cn(
                  ROW_GRID,
                  "group relative min-h-[72px] items-center border-t border-border transition-colors duration-200 md:min-h-[60px]",
                  checked ? "bg-accent-muted" : "hover:bg-paper",
                  menuOpen && !checked && "bg-paper",
                  i === rows.length - 1 && "rounded-b-md"
                )}
              >
                <div role="cell" className="flex items-center justify-center px-3">
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer accent-pine"
                    aria-label={`Select ${s.name}`}
                    checked={checked}
                    onChange={() => toggle(s.id)}
                  />
                </div>
                <div role="cell" className="min-w-0 px-3">
                  <Link
                    href={savedHref(s.id)}
                    className="block truncate text-body-sm font-semibold text-text-primary no-underline hover:text-pine hover:underline hover:underline-offset-[3px]"
                  >
                    {s.name}
                  </Link>
                  <div className="font-data truncate text-[13px] font-normal text-text-tertiary md:hidden">
                    {isJoint(s) ? "Joint" : "Single"} · {formatAxisCurrency(s.ira_balance)} IRA ·
                    saves {formatAxisCurrency(savings)}
                  </div>
                </div>
                <div
                  role="cell"
                  className="hidden min-w-0 px-3 text-body-sm text-text-secondary md:block"
                >
                  {isJoint(s) ? "Married filing jointly" : "Single"}
                </div>
                <div role="cell" className="font-data hidden px-3 text-right text-body-sm md:block">
                  {formatCurrency(s.ira_balance)}
                </div>
                <div
                  role="cell"
                  className="font-data hidden px-3 text-right text-body-sm text-text-secondary md:block"
                >
                  {s.num_years} {s.num_years === 1 ? "year" : "years"}
                </div>
                <div role="cell" className="font-data hidden px-3 text-right text-body-sm md:block">
                  <span
                    className={savings > 0 ? "font-semibold text-optimal" : "text-text-tertiary"}
                  >
                    {formatCurrency(savings)}
                  </span>
                </div>
                <div
                  role="cell"
                  className="font-data hidden px-3 text-body-sm text-text-tertiary md:block"
                >
                  {formatSavedDate(s.created_at)}
                </div>
                <div role="cell" className="flex items-center justify-end gap-0.5 pr-1 md:pr-3">
                  <button
                    type="button"
                    aria-label={`Delete ${s.name}`}
                    title="Delete"
                    onClick={() => setConfirmIds([s.id])}
                    className="hidden h-[34px] w-[34px] items-center justify-center rounded-sm text-text-tertiary opacity-0 transition-[background,color,opacity] duration-200 hover:bg-negative/10 hover:text-negative focus-visible:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-pine-mid group-focus-within:opacity-100 group-hover:opacity-100 md:inline-flex"
                  >
                    <TrashIcon />
                  </button>
                  <button
                    type="button"
                    aria-label={`More actions for ${s.name}`}
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    onClick={() => setMenuId(menuOpen ? null : s.id)}
                    className={cn(
                      "inline-flex h-11 w-11 items-center justify-center rounded-sm text-text-tertiary transition-colors duration-200 hover:bg-paper-deep hover:text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-pine-mid md:h-[34px] md:w-[34px]",
                      menuOpen && "bg-paper-deep text-text-primary"
                    )}
                  >
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="currentColor"
                      aria-hidden="true"
                    >
                      <circle cx="5" cy="12" r="1.7" />
                      <circle cx="12" cy="12" r="1.7" />
                      <circle cx="19" cy="12" r="1.7" />
                    </svg>
                  </button>
                </div>
                {menuOpen && (
                  <RowMenu
                    scenario={s}
                    onClose={() => setMenuId(null)}
                    onDelete={() => {
                      setMenuId(null);
                      setConfirmIds([s.id]);
                    }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {rows.length === 0 && (
          <div className="flex flex-col items-center gap-2.5 border-t border-border px-6 py-10 text-center">
            <p className="m-0 font-semibold text-text-primary">No scenarios match your search</p>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="min-h-[36px] rounded-full bg-paper-warm px-3.5 text-body-sm font-medium text-pine transition-colors duration-200 hover:bg-paper-deep"
            >
              Clear search
            </button>
          </div>
        )}
      </div>

      {selectedIds.length > 0 && !confirmIds && (
        <div
          role="toolbar"
          aria-label="Selected scenarios"
          className="animate-bar-rise fixed bottom-4 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full border border-pine-line bg-pine-deep py-1.5 pl-[18px] pr-1.5 text-[#f5f2ea] shadow-[0_16px_40px_-12px_rgba(11,29,21,0.4)] md:bottom-7"
        >
          <span className="font-data text-body-sm font-semibold">
            {selectedIds.length} selected
          </span>
          <span className="mx-1 h-5 w-px bg-pine-line" aria-hidden="true" />
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="inline-flex h-9 items-center rounded-full px-3.5 text-body-sm font-medium transition-colors duration-200 hover:bg-[#f5f2ea]/10"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => setConfirmIds(selectedIds)}
            className="inline-flex h-9 items-center gap-2 rounded-full bg-[#f5f2ea] px-3.5 text-body-sm font-semibold text-negative transition-colors duration-200 hover:bg-white"
          >
            <TrashIcon />
            Delete
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirmItems.length > 0}
        title={many ? `Delete ${confirmItems.length} scenarios?` : "Delete this scenario?"}
        description={
          many
            ? "These scenarios and their results will be removed from your account, wherever you saved them. You can undo right after."
            : `“${confirmItems[0]?.name ?? ""}” and its results will be removed from your account, including from Claude or ChatGPT if you saved it there. You can undo right after.`
        }
        confirmLabel={many ? `Delete ${confirmItems.length} scenarios` : "Delete scenario"}
        onConfirm={confirm}
        onCancel={() => setConfirmIds(null)}
      >
        {many && (
          <DialogList>
            {confirmItems.map((s) => (
              <li key={s.id}>
                <span className="min-w-0 truncate">{s.name}</span>
                <span className="font-data shrink-0 text-text-tertiary">
                  {formatSavedDate(s.created_at)}
                </span>
              </li>
            ))}
          </DialogList>
        )}
      </ConfirmDialog>
    </div>
  );
}

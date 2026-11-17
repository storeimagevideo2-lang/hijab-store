"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

export type AdminPaginationProps = {
  page: number;
  pageSize: number;
  totalItems: number;
  itemLabel?: string;
  pageSizeOptions?: number[];
  loading?: boolean;
  onPageChange: (nextPage: number) => void;
  onPageSizeChange: (nextSize: number) => void;
};

function buildPageNumbers(current: number, total: number): Array<number | "ellipsis"> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  const pages: Array<number | "ellipsis"> = [1];
  const left = Math.max(2, current - 1);
  const right = Math.min(total - 1, current + 1);

  if (left > 2) pages.push("ellipsis");
  for (let p = left; p <= right; p++) {
    pages.push(p);
  }
  if (right < total - 1) pages.push("ellipsis");
  pages.push(total);
  return pages;
}

export function AdminPagination({
  page,
  pageSize,
  totalItems,
  itemLabel = "items",
  pageSizeOptions = [10, 20, 50],
  loading = false,
  onPageChange,
  onPageSizeChange,
}: AdminPaginationProps) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(totalItems, safePage * pageSize);
  const pageNumbers = buildPageNumbers(safePage, totalPages);

  return (
    <div className="adm-pagination" aria-label={`${itemLabel} pagination`}>
      <div className="adm-pagination-meta">
        <span>
          Showing <strong>{start}</strong>–<strong>{end}</strong> of{" "}
          <strong>{totalItems.toLocaleString()}</strong> {itemLabel}
          {loading ? " · Loading…" : ""}
        </span>
        <label className="adm-pagination-size">
          <span>Per page:</span>
          <select
            className="adm-select-sm"
            value={pageSize}
            onChange={(e) => {
              const nextSize = Number(e.target.value);
              onPageSizeChange(nextSize);
              onPageChange(1);
            }}
            aria-label={`Rows per page for ${itemLabel}`}
          >
            {pageSizeOptions.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="adm-pagination-btns">
        <button
          type="button"
          className="adm-btn adm-btn-sm adm-btn-secondary"
          disabled={safePage <= 1 || loading}
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
        >
          <ChevronLeft size={14} /> Prev
        </button>

        {pageNumbers.map((entry, idx) =>
          entry === "ellipsis" ? (
            <span key={`e-${idx}`} className="adm-pagination-ellipsis" aria-hidden="true">
              …
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              className={`adm-btn adm-btn-sm ${
                entry === safePage ? "adm-btn-primary" : "adm-btn-secondary"
              }`}
              disabled={loading}
              aria-current={entry === safePage ? "page" : undefined}
              onClick={() => onPageChange(entry)}
            >
              {entry}
            </button>
          ),
        )}

        <button
          type="button"
          className="adm-btn adm-btn-sm adm-btn-secondary"
          disabled={safePage >= totalPages || loading}
          onClick={() => onPageChange(Math.min(totalPages, safePage + 1))}
        >
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

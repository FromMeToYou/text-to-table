"use client";

import { useEffect, useMemo, useRef } from "react";
import type { MutableRefObject } from "react";
import {
  columnResizingFeature,
  columnSizingFeature,
  createSortedRowModel,
  rowSortingFeature,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import type { ColumnDef, Row } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { sortKey } from "@/engine";
import type { Column, ColumnType } from "@/engine/types";

const features = tableFeatures({
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  columnSizingFeature,
  columnResizingFeature,
});

/** Column types sorted/displayed as numbers, right-aligned in the grid. */
const NUMERIC_TYPES: ReadonlySet<ColumnType> = new Set([
  "number",
  "percentage",
  "size",
  "duration",
  "ratio",
]);

type RowRecord = Record<string, string> & { __id: string };

const EMPTY_RECORDS: RowRecord[] = [];

/** Ascending comparator over sortKey() output. NaN and empty strings sort last. */
function compareSortKeys(a: number | string, b: number | string): number {
  if (typeof a === "number" && typeof b === "number") {
    const aNaN = Number.isNaN(a);
    const bNaN = Number.isNaN(b);
    if (aNaN && bNaN) return 0;
    if (aNaN) return 1;
    if (bNaN) return -1;
    return a - b;
  }
  const as = String(a);
  const bs = String(b);
  if (as === "" && bs === "") return 0;
  if (as === "") return 1;
  if (bs === "") return -1;
  return as.localeCompare(bs);
}

// --- Column width from content -------------------------------------------

/** Approximate monospace character width at the table's 13px font size. */
const CH_PX = 8;
/** Horizontal cell padding (6px 10px in CSS -> 20px total). */
const CELL_PADDING_PX = 20;
const MIN_COL_PX = 64;
const MAX_COL_PX = 480;
const RESIZE_MIN_PX = 64;
const RESIZE_MAX_PX = 800;
/** Only sample the first N rows to size columns; enough signal, stays cheap on large pastes. */
const SIZE_SAMPLE_ROWS = 200;

function computeColumnSizes(columns: Column[], sampleRows: string[][]): Record<string, number> {
  const sizes: Record<string, number> = {};
  const sampleCount = Math.min(sampleRows.length, SIZE_SAMPLE_ROWS);
  columns.forEach((col, ci) => {
    let maxLen = col.name.length;
    for (let i = 0; i < sampleCount; i++) {
      const cell = sampleRows[i][ci];
      if (cell && cell.length > maxLen) maxLen = cell.length;
    }
    sizes[col.id] = Math.min(MAX_COL_PX, Math.max(MIN_COL_PX, maxLen * CH_PX + CELL_PADDING_PX));
  });
  return sizes;
}

// --- Precomputed sort keys -------------------------------------------------
// The sortFn below is called O(n log n) times per sort by TanStack's sorted
// row model. sortKey() can be non-trivial (type-aware parsing), so we resolve
// it once per row per column (O(n)) instead of inside every comparison, and
// cache the result in a ref keyed by the current `data` array so it survives
// across re-renders (e.g. toggling sort direction) without recomputation.
type SortKeyCache = { data: RowRecord[]; maps: Map<string, Map<string, number | string>> };

function getSortKeyMap(
  cacheRef: MutableRefObject<SortKeyCache>,
  columnId: string,
  colType: ColumnType
): Map<string, number | string> {
  const cache = cacheRef.current;
  let map = cache.maps.get(columnId);
  if (!map) {
    map = new Map();
    for (const row of cache.data) {
      map.set(row.__id, sortKey(row[columnId] ?? "", colType));
    }
    cache.maps.set(columnId, map);
  }
  return map;
}

interface DataTableProps {
  columns: Column[];
  /** Rows to display, already filtered (e.g. by search). */
  rows: string[][];
  /** Rows sampled for default column width; defaults to `rows` when omitted. */
  sizingRows?: string[][];
  /** Shown in place of the body when there are no rows to display. */
  emptyMessage?: string;
  /** Reports the currently rendered (filtered + sorted) rows, for export. */
  onVisibleRowsChange?: (rows: string[][]) => void;
}

export default function DataTable({
  columns,
  rows,
  sizingRows,
  emptyMessage = "No rows to display.",
  onVisibleRowsChange,
}: DataTableProps) {
  const data = useMemo<RowRecord[]>(() => {
    if (rows.length === 0) return EMPTY_RECORDS;
    return rows.map((r, i) => {
      const rec = { __id: String(i) } as RowRecord;
      columns.forEach((col, ci) => {
        rec[col.id] = r[ci] ?? "";
      });
      return rec;
    });
  }, [rows, columns]);

  // Reset (and lazily rebuild) the sort-key cache whenever the row set changes.
  // Mutating a ref during render like this is safe: it only affects this
  // cache, never triggers a re-render itself, and is idempotent.
  const sortCacheRef = useRef<SortKeyCache>({ data, maps: new Map() });
  if (sortCacheRef.current.data !== data) {
    sortCacheRef.current = { data, maps: new Map() };
  }

  const columnSizes = useMemo(
    () => computeColumnSizes(columns, sizingRows ?? rows),
    [columns, sizingRows, rows]
  );

  const tableColumns = useMemo<ColumnDef<typeof features, RowRecord, unknown>[]>(
    () =>
      columns.map((col) => ({
        id: col.id,
        header: col.name,
        accessorFn: (row: RowRecord) => row[col.id] ?? "",
        size: columnSizes[col.id] ?? MIN_COL_PX,
        minSize: RESIZE_MIN_PX,
        maxSize: RESIZE_MAX_PX,
        sortFn: (rowA: Row<typeof features, RowRecord>, rowB: Row<typeof features, RowRecord>, columnId: string) =>
          compareSortKeys(
            getSortKeyMap(sortCacheRef, columnId, col.type).get(rowA.id) ?? Number.NaN,
            getSortKeyMap(sortCacheRef, columnId, col.type).get(rowB.id) ?? Number.NaN
          ),
      })),
    [columns, columnSizes]
  );

  const table = useTable({
    features,
    columns: tableColumns,
    data,
    getRowId: (row) => row.__id,
    columnResizeMode: "onChange",
    enableSortingRemoval: true,
  });

  const visibleRows = table.getRowModel().rows;

  useEffect(() => {
    onVisibleRowsChange?.(visibleRows.map((row) => columns.map((col) => row.getValue<string>(col.id) ?? "")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleRows, columns]);

  const columnTypeById = useMemo(() => {
    const m = new Map<string, ColumnType>();
    columns.forEach((c) => m.set(c.id, c.type));
    return m;
  }, [columns]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 32,
    overscan: 12,
    getItemKey: (index) => visibleRows[index]?.id ?? index,
  });

  // The row set's identity changes whenever `rows` changes (new search term,
  // new paste, sort...). A stale DOM scrollTop from before a shrink (e.g. a
  // search matching nothing) can desync from the virtualizer's own offset
  // once rows come back, leaving rendered items outside the viewport. Resync
  // by snapping to the top and forcing a fresh measurement every time.
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
    rowVirtualizer.scrollToOffset(0);
    rowVirtualizer.measure();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const headerGroups = table.getHeaderGroups();
  const totalSize = table.getTotalSize();

  return (
    <div className="tableWrap" ref={scrollRef}>
      <div className="tableGrid" role="table" style={{ width: totalSize }}>
        {headerGroups.map((group) => (
          <div className="tableHeaderRow" role="row" key={group.id}>
            {group.headers.map((header) => {
              const type = columnTypeById.get(header.column.id);
              const numeric = type ? NUMERIC_TYPES.has(type) : false;
              const sorted = header.column.getIsSorted();
              return (
                <div
                  key={header.id}
                  role="columnheader"
                  className="tableHeaderCell"
                  style={{ width: header.getSize(), textAlign: numeric ? "right" : "left" }}
                >
                  <button
                    type="button"
                    className="tableHeaderButton"
                    // Prevent the button from taking focus on a pointer click: a
                    // focused element inside an overflow:auto container can be
                    // scrolled into view by the browser, visibly shifting the
                    // table sideways. Keyboard (Tab) focus is unaffected.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={header.column.getToggleSortingHandler()}
                  >
                    <span className="tableHeaderName">
                      {header.isPlaceholder ? null : <table.FlexRender header={header} />}
                      <span className="sortIndicator">
                        {sorted === "asc" ? "▲" : sorted === "desc" ? "▼" : ""}
                      </span>
                    </span>
                    {type && <span className="typeLabel">{type}</span>}
                  </button>
                  <div
                    className="resizeHandle"
                    onMouseDown={header.getResizeHandler()}
                    onTouchStart={header.getResizeHandler()}
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              );
            })}
          </div>
        ))}
        <div
          className="tableBody"
          role="rowgroup"
          style={{
            height: visibleRows.length === 0 ? undefined : rowVirtualizer.getTotalSize(),
            position: "relative",
          }}
        >
          {visibleRows.length === 0 ? (
            <div className="tableEmptyState">{emptyMessage}</div>
          ) : (
            rowVirtualizer.getVirtualItems().map((item) => {
              const row = visibleRows[item.index];
              return (
                <div
                  key={row.id}
                  role="row"
                  data-index={item.index}
                  ref={rowVirtualizer.measureElement}
                  className={`tableRow${item.index % 2 === 1 ? " zebra" : ""}`}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${item.start}px)`,
                  }}
                >
                  {row.getAllCells().map((cell) => {
                    const type = columnTypeById.get(cell.column.id);
                    const numeric = type ? NUMERIC_TYPES.has(type) : false;
                    const value = cell.getValue<string>();
                    return (
                      <div
                        key={cell.id}
                        role="cell"
                        className="tableCell"
                        title={value}
                        style={{ width: cell.column.getSize(), textAlign: numeric ? "right" : "left" }}
                      >
                        <table.FlexRender cell={cell} />
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

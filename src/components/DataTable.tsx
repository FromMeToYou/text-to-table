"use client";

import { useEffect, useMemo, useRef } from "react";
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

interface DataTableProps {
  columns: Column[];
  rows: string[][];
  /** Reports the currently rendered (filtered + sorted) rows, for export. */
  onVisibleRowsChange?: (rows: string[][]) => void;
}

export default function DataTable({ columns, rows, onVisibleRowsChange }: DataTableProps) {
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

  const tableColumns = useMemo<ColumnDef<typeof features, RowRecord, unknown>[]>(
    () =>
      columns.map((col) => ({
        id: col.id,
        header: col.name,
        accessorFn: (row: RowRecord) => row[col.id] ?? "",
        size: 200,
        minSize: 72,
        maxSize: 640,
        sortFn: (rowA: Row<typeof features, RowRecord>, rowB: Row<typeof features, RowRecord>, columnId: string) =>
          compareSortKeys(
            sortKey(rowA.getValue(columnId) as string, col.type),
            sortKey(rowB.getValue(columnId) as string, col.type)
          ),
      })),
    [columns]
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

  const headerGroups = table.getHeaderGroups();
  const totalSize = table.getTotalSize();

  return (
    <div className="tableWrap" ref={scrollRef}>
      <div className="tableGrid" role="table" style={{ minWidth: totalSize }}>
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
          style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}
        >
          {rowVirtualizer.getVirtualItems().map((item) => {
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
                  return (
                    <div
                      key={cell.id}
                      role="cell"
                      className="tableCell"
                      style={{ width: cell.column.getSize(), textAlign: numeric ? "right" : "left" }}
                    >
                      <table.FlexRender cell={cell} />
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

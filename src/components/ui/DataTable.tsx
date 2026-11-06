"use client";

import { useMemo, useState, type ReactNode } from "react";
import { cx } from "@/lib/cx";
import { Icon } from "@/components/icons/Icon";
import styles from "./DataTable.module.css";

/**
 * Tabel: header lengket, kolom angka rata kanan dengan tabular-nums, urutan terlihat (aria-sort),
 * baris menyorot saat hover dan saat fokus berada di dalamnya. Di HP (< 48rem) setiap baris menjadi kartu,
 * label kolom diambil dari data-label.
 */
export interface Column<T> {
  key: string;
  header: string;
  numeric?: boolean;
  sortValue?: (row: T) => number | string;
  cell: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  caption: string;
  columns: ReadonlyArray<Column<T>>;
  rows: readonly T[];
  rowKey: (row: T) => string;
  initialSort?: { key: string; dir: "asc" | "desc" };
}

export function DataTable<T>({ caption, columns, rows, rowKey, initialSort }: DataTableProps<T>) {
  const [sort, setSort] = useState(initialSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.key === sort.key);
    const get = col?.sortValue;
    if (!get) return rows;
    const factor = sort.dir === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => {
      const va = get(a);
      const vb = get(b);
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * factor;
      return String(va).localeCompare(String(vb)) * factor;
    });
  }, [rows, columns, sort]);

  const toggle = (key: string) =>
    setSort((cur) => (cur && cur.key === key ? { key, dir: cur.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  return (
    <div className={styles.wrap}>
      <table className={styles.table}>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => {
              const active = sort?.key === c.key;
              return (
                <th
                  key={c.key}
                  scope="col"
                  className={cx(styles.th, c.numeric && styles.num)}
                  aria-sort={active ? (sort?.dir === "asc" ? "ascending" : "descending") : c.sortValue ? "none" : undefined}
                >
                  {c.sortValue ? (
                    <button type="button" className={styles.sortBtn} onClick={() => toggle(c.key)}>
                      <span>{c.header}</span>
                      <Icon
                        name="chevron-down"
                        size={16}
                        className={cx(styles.sortIcon, active && styles.sortOn, active && sort?.dir === "asc" && styles.asc)}
                      />
                    </button>
                  ) : (
                    c.header
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={rowKey(row)} className={styles.row}>
              {columns.map((c) => (
                <td key={c.key} data-label={c.header} className={cx(styles.td, c.numeric && styles.num, c.numeric && "type-num")}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

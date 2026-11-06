import type { SVGProps } from "react";

/**
 * Satu keluarga ikon: garis 1,5px, ujung dan sambungan bulat, kotak 24px, bergaya simbol peta.
 * Dibuat lewat kode. Ikon dekoratif memakai aria-hidden; ikon yang membawa makna diberi label oleh pemakainya.
 */
const PATHS = {
  check: "M5 12.5l4.5 4.5L19 7.5",
  x: "M6 6l12 12M18 6L6 18",
  alert: "M12 4.5l8.5 14.5h-17zM12 10.2v4M12 16.8v.2",
  info: "M3.5 12a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0-17 0M12 11v5M12 7.8v.2",
  "arrow-right": "M5 12h14M13 6l6 6-6 6",
  "chevron-down": "M6 9.5l6 6 6-6",
  external: "M14 5h5v5M19 5l-8 8M17 14v4.5a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1H11",
  copy: "M9 9h10v10H9zM15 9V6.5a1 1 0 0 0-1-1H6.5a1 1 0 0 0-1 1V14a1 1 0 0 0 1 1H9",
  menu: "M4 7h16M4 12h16M4 17h16",
  sun: "M8.5 12a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M6 6l1.4 1.4M16.6 16.6L18 18M6 18l1.4-1.4M16.6 7.4L18 6",
  moon: "M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z",
  wallet: "M4.5 8h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-13a1 1 0 0 1-1-1V7.5A1.5 1.5 0 0 1 5 6h11M15.5 13.5h2",
  search: "M5 11a6 6 0 1 0 12 0a6 6 0 1 0-12 0M15.5 15.5L20 20",
  clock: "M3.5 12a8.5 8.5 0 1 0 17 0a8.5 8.5 0 1 0-17 0M12 7.5V12l3 2",
  refresh: "M19 11a7 7 0 0 0-12-3.5L5 10M5 5v5h5M5 13a7 7 0 0 0 12 3.5L19 14M19 19v-5h-5",
  lock: "M5.5 10.5h13v9h-13zM8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  wave: "M3 9c3 0 3-3 6-3s3 3 6 3 3-3 6-3M3 15c3 0 3-3 6-3s3 3 6 3 3-3 6-3M3 21c3 0 3-3 6-3s3 3 6 3 3-3 6-3",
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "name"> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 20, ...rest }: IconProps) {
  const labelled = typeof rest["aria-label"] === "string";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={labelled ? undefined : true}
      role={labelled ? "img" : undefined}
      focusable="false"
      {...rest}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

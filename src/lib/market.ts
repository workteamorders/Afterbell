import { CALENDAR_YEARS, EARLY_CLOSES, HOLIDAYS } from "./market-calendar";

/**
 * Status pasar AS, dihitung lokal. Sesi reguler 09.30 sampai 16.00 waktu New York, Senin sampai Jumat,
 * kecuali hari libur dan tutup awal (13.00) dari kalender bersumber.
 */
const TZ = "America/New_York";
const OPEN_MIN = 9 * 60 + 30;
const CLOSE_MIN = 16 * 60;
const EARLY_CLOSE_MIN = 13 * 60;

export type MarketState = "open" | "closed" | "unknown";
export type ClosedReason = "weekend" | "holiday" | "before-open" | "after-close";

export interface MarketStatus {
  state: MarketState;
  /** Hanya bila state = closed. */
  reason?: ClosedReason;
  holidayName?: string;
  earlyClose?: boolean;
  /** Kalender belum memuat tahun ini: status tidak ditebak. */
  calendarLoaded: boolean;
  /** Waktu perubahan berikutnya (buka atau tutup), bila diketahui. */
  nextChange?: Date;
  nextChangeKind?: "open" | "close";
}

interface Zoned {
  y: number;
  m: number;
  d: number;
  hh: number;
  mm: number;
  weekday: number; // 0 = Minggu
}

const fmt = new Intl.DateTimeFormat("en-US", {
  timeZone: TZ,
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  weekday: "short",
});

const WEEKDAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

function zoned(date: Date): Zoned {
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(date)) parts[p.type] = p.value;
  return {
    y: Number(parts.year),
    m: Number(parts.month),
    d: Number(parts.day),
    hh: Number(parts.hour) % 24,
    mm: Number(parts.minute),
    weekday: WEEKDAYS[parts.weekday ?? "Sun"] ?? 0,
  };
}

const pad = (n: number): string => String(n).padStart(2, "0");
const key = (y: number, m: number, d: number): string => `${y}-${pad(m)}-${pad(d)}`;

/** Mengubah waktu dinding New York menjadi instan UTC (menangani DST dengan dua iterasi). */
export function newYorkToUtc(y: number, m: number, d: number, hh: number, mm: number): Date {
  let guess = Date.UTC(y, m - 1, d, hh, mm);
  for (let i = 0; i < 3; i++) {
    const z = zoned(new Date(guess));
    const asUtc = Date.UTC(z.y, z.m - 1, z.d, z.hh, z.mm);
    const wanted = Date.UTC(y, m - 1, d, hh, mm);
    guess += wanted - asUtc;
  }
  return new Date(guess);
}

const HOLIDAY_BY_DATE = new Map(HOLIDAYS.map((h) => [h.date, h.name]));
const EARLY = new Set(EARLY_CLOSES);

function dayInfo(y: number, m: number, d: number, weekday: number): { trading: boolean; holiday?: string; closeMin: number } {
  const k = key(y, m, d);
  if (weekday === 0 || weekday === 6) return { trading: false, closeMin: CLOSE_MIN };
  const holiday = HOLIDAY_BY_DATE.get(k);
  if (holiday) return { trading: false, holiday, closeMin: CLOSE_MIN };
  return { trading: true, closeMin: EARLY.has(k) ? EARLY_CLOSE_MIN : CLOSE_MIN };
}

function nextOpen(from: Date): Date | undefined {
  const start = zoned(from);
  const base = Date.UTC(start.y, start.m - 1, start.d);
  for (let i = 0; i < 12; i++) {
    const dt = new Date(base + i * 86_400_000);
    const y = dt.getUTCFullYear();
    const m = dt.getUTCMonth() + 1;
    const d = dt.getUTCDate();
    if (!(CALENDAR_YEARS as readonly number[]).includes(y)) return undefined;
    const info = dayInfo(y, m, d, dt.getUTCDay());
    if (!info.trading) continue;
    const open = newYorkToUtc(y, m, d, 9, 30);
    if (open.getTime() > from.getTime()) return open;
  }
  return undefined;
}

export function getMarketStatus(now: Date = new Date()): MarketStatus {
  const z = zoned(now);
  if (!(CALENDAR_YEARS as readonly number[]).includes(z.y)) return { state: "unknown", calendarLoaded: false };

  const info = dayInfo(z.y, z.m, z.d, z.weekday);
  const minutes = z.hh * 60 + z.mm;

  if (info.trading && minutes >= OPEN_MIN && minutes < info.closeMin) {
    const close = newYorkToUtc(z.y, z.m, z.d, Math.floor(info.closeMin / 60), info.closeMin % 60);
    return { state: "open", calendarLoaded: true, earlyClose: info.closeMin === EARLY_CLOSE_MIN, nextChange: close, nextChangeKind: "close" };
  }

  let reason: ClosedReason;
  if (z.weekday === 0 || z.weekday === 6) reason = "weekend";
  else if (info.holiday) reason = "holiday";
  else reason = minutes < OPEN_MIN ? "before-open" : "after-close";

  const next = nextOpen(now);
  return {
    state: "closed",
    reason,
    holidayName: info.holiday,
    calendarLoaded: true,
    nextChange: next,
    nextChangeKind: next ? "open" : undefined,
  };
}

/** Teks jujur untuk pengguna. Tidak menjanjikan apa pun tentang harga. */
export function describeMarket(status: MarketStatus): { title: string; body: string } {
  if (status.state === "unknown") {
    return {
      title: "US market hours: calendar not loaded",
      body: "Afterbell has no holiday calendar for this year, so it does not guess whether the US market is open.",
    };
  }
  if (status.state === "open") {
    return {
      title: status.earlyClose ? "US market is open (closes early today)" : "US market is open",
      body: "Token prices follow the stock market while it trades. Spreads are usually tightest now.",
    };
  }
  const why =
    status.reason === "weekend"
      ? "It is the weekend."
      : status.reason === "holiday"
        ? `US exchanges are closed for ${status.holidayName ?? "a holiday"}.`
        : status.reason === "before-open"
          ? "The regular session has not started yet."
          : "The regular session has ended.";
  return {
    title: "US market is closed",
    body: `${why} The stock does not trade now, so the token price is set by on-chain demand and can differ from the stock price when the market opens.`,
  };
}

/**
 * Kalender bursa AS (NYSE) 2026 sampai 2028.
 * Sumber: nyse.com/markets/hours-calendars, dicek silang dengan nasdaq.com untuk 2026 (diambil 2026-11-04).
 * Di luar rentang ini aplikasi menampilkan "calendar not loaded" alih-alih menebak (D-014).
 */
export interface Holiday {
  date: string; // YYYY-MM-DD di waktu New York
  name: string;
}

export const CALENDAR_YEARS = [2026, 2027, 2028] as const;

export const HOLIDAYS: readonly Holiday[] = [
  { date: "2026-01-01", name: "New Year's Day" },
  { date: "2026-01-19", name: "Martin Luther King, Jr. Day" },
  { date: "2026-02-16", name: "Washington's Birthday" },
  { date: "2026-04-03", name: "Good Friday" },
  { date: "2026-05-25", name: "Memorial Day" },
  { date: "2026-06-19", name: "Juneteenth" },
  { date: "2026-07-03", name: "Independence Day (observed)" },
  { date: "2026-09-07", name: "Labor Day" },
  { date: "2026-11-26", name: "Thanksgiving Day" },
  { date: "2026-12-25", name: "Christmas Day" },

  { date: "2027-01-01", name: "New Year's Day" },
  { date: "2027-01-18", name: "Martin Luther King, Jr. Day" },
  { date: "2027-02-15", name: "Washington's Birthday" },
  { date: "2027-03-26", name: "Good Friday" },
  { date: "2027-05-31", name: "Memorial Day" },
  { date: "2027-06-18", name: "Juneteenth (observed)" },
  { date: "2027-07-05", name: "Independence Day (observed)" },
  { date: "2027-09-06", name: "Labor Day" },
  { date: "2027-11-25", name: "Thanksgiving Day" },
  { date: "2027-12-24", name: "Christmas Day (observed)" },

  // 2028: 1 Januari jatuh pada hari Sabtu dan tidak ada hari libur pengganti.
  { date: "2028-01-17", name: "Martin Luther King, Jr. Day" },
  { date: "2028-02-21", name: "Washington's Birthday" },
  { date: "2028-04-14", name: "Good Friday" },
  { date: "2028-05-29", name: "Memorial Day" },
  { date: "2028-06-19", name: "Juneteenth" },
  { date: "2028-07-04", name: "Independence Day" },
  { date: "2028-09-04", name: "Labor Day" },
  { date: "2028-11-23", name: "Thanksgiving Day" },
  { date: "2028-12-25", name: "Christmas Day" },
];

/** Tutup awal pukul 13.00 ET. */
export const EARLY_CLOSES: readonly string[] = ["2026-11-27", "2026-12-24", "2027-11-26", "2028-07-03", "2028-11-24"];

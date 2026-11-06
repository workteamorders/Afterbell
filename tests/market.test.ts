import { describe, expect, it } from "vitest";
import { getMarketStatus, newYorkToUtc } from "../src/lib/market";

const at = (iso: string) => getMarketStatus(new Date(iso));

describe("US market status", () => {
  it("is open mid-session on a regular weekday (EST)", () => {
    // Rabu 2026-01-14 10:00 EST = 15:00 UTC
    const s = at("2026-01-14T15:00:00Z");
    expect(s.state).toBe("open");
    expect(s.nextChangeKind).toBe("close");
    expect(s.nextChange?.toISOString()).toBe("2026-01-14T21:00:00.000Z");
  });

  it("handles daylight saving time: 09:30 EDT is 13:30 UTC", () => {
    expect(at("2026-07-15T13:29:00Z").state).toBe("closed");
    expect(at("2026-07-15T13:30:00Z").state).toBe("open");
    expect(at("2026-07-15T19:59:00Z").state).toBe("open");
    expect(at("2026-07-15T20:00:00Z").state).toBe("closed");
  });

  it("switches at the right instant around the DST change", () => {
    // DST 2026 mulai 8 Maret. Senin 9 Maret buka 09:30 EDT = 13:30 UTC.
    expect(at("2026-03-09T13:30:00Z").state).toBe("open");
    expect(at("2026-03-09T13:29:00Z").state).toBe("closed");
    // Jumat 6 Maret masih EST: buka 14:30 UTC.
    expect(at("2026-03-06T14:29:00Z").state).toBe("closed");
    expect(at("2026-03-06T14:30:00Z").state).toBe("open");
  });

  it("is closed on weekends and reports the next open", () => {
    const s = at("2026-11-07T15:00:00Z"); // Sabtu
    expect(s.state).toBe("closed");
    expect(s.reason).toBe("weekend");
    expect(s.nextChange?.toISOString()).toBe("2026-11-09T14:30:00.000Z");
  });

  it("is closed on exchange holidays", () => {
    const s = at("2026-11-26T16:00:00Z"); // Thanksgiving
    expect(s.state).toBe("closed");
    expect(s.reason).toBe("holiday");
    expect(s.holidayName).toBe("Thanksgiving Day");
    // Buka berikutnya Jumat 27 Nov 09:30 EST = 14:30 UTC
    expect(s.nextChange?.toISOString()).toBe("2026-11-27T14:30:00.000Z");
  });

  it("uses the observed Independence Day holiday in 2026", () => {
    expect(at("2026-07-03T15:00:00Z").reason).toBe("holiday");
  });

  it("closes early at 13:00 ET on listed days", () => {
    const open = at("2026-11-27T17:30:00Z"); // 12:30 EST
    expect(open.state).toBe("open");
    expect(open.earlyClose).toBe(true);
    expect(at("2026-11-27T18:00:00Z").state).toBe("closed"); // 13:00 EST
  });

  it("reports before-open and after-close", () => {
    expect(at("2026-01-14T14:00:00Z").reason).toBe("before-open"); // 09:00 EST
    expect(at("2026-01-14T21:30:00Z").reason).toBe("after-close"); // 16:30 EST
  });

  it("does not guess outside the calendar range", () => {
    const s = at("2029-03-14T15:00:00Z");
    expect(s.state).toBe("unknown");
    expect(s.calendarLoaded).toBe(false);
  });

  it("converts New York wall time to UTC across DST", () => {
    expect(newYorkToUtc(2026, 3, 8, 12, 0).toISOString()).toBe("2026-03-08T16:00:00.000Z");
    expect(newYorkToUtc(2026, 11, 1, 12, 0).toISOString()).toBe("2026-11-01T17:00:00.000Z");
  });
});

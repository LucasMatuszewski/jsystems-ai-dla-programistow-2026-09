import { describe, expect, it } from "vitest";
import { getEmployeeToday, isISOCalendarDate } from "@/lib/contracts/calendar";

describe("ISO calendar dates", () => {
  it.each(["2026-10-01", "2024-02-29", "2000-02-29", "2026-12-31"])("accepts %s", (date) => {
    expect(isISOCalendarDate(date)).toBe(true);
  });
  it.each(["2026-02-29", "1900-02-29", "2026-04-31", "2026-13-01", "2026-00-01", "2026-01-00", "2026-1-01", "2026-01-1", "2026-10-01T00:00:00Z", "", null, undefined, 20261001])("rejects impossible or non-calendar input %s", (date) => {
    expect(isISOCalendarDate(date)).toBe(false);
  });
});

describe("employee-local evaluation date", () => {
  it.each([
    ["Europe/Warsaw", "2026-10-01T22:30:00Z", "2026-10-02"],
    ["America/Los_Angeles", "2026-10-01T00:30:00Z", "2026-09-30"],
    ["Pacific/Kiritimati", "2026-12-31T12:00:00Z", "2027-01-01"],
    ["Europe/Warsaw", "2026-03-29T01:30:00Z", "2026-03-29"],
    ["UTC", "2026-10-01T22:30:00Z", "2026-10-01"],
  ])("derives the calendar in %s at %s", (zone, instant, expected) => {
    expect(getEmployeeToday(zone, new Date(instant))).toBe(expected);
  });
  it.each(["", "Mars/Olympus", "+02:00", " Europe/Warsaw "])("rejects invalid IANA zone %s", (zone) => {
    expect(() => getEmployeeToday(zone, new Date("2026-10-01T12:00:00Z"))).toThrow(RangeError);
  });
  it("rejects an invalid evaluation instant", () => {
    expect(() => getEmployeeToday("UTC", new Date("invalid"))).toThrow(RangeError);
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StorageNotice } from "./storage-notice";
vi.mock("../../lib/contracts/session", () => ({
  ACTIVE_CASE_STORAGE_KEY: "hardware-service-copilot.active-case",
  SNAPSHOT_SOFT_UTF16_BUDGET: 4000000,
  activeCaseSnapshotSchema: { safeParse: vi.fn() },
}));
describe("persistent Polish storage notice", () => {
  it("renders nothing when saving works", () => { const { container } = render(<StorageNotice warning={null} />); expect(container).toBeEmptyDOMElement(); });
  it.each(["unavailable", "quota-exceeded", "snapshot-too-large"] as const)("honestly explains refresh recovery for %s", warning => {
    const { rerender } = render(<StorageNotice warning={warning} />);
    expect(screen.getByRole("status")).toHaveTextContent("Bieżąca sprawa pozostaje dostępna");
    expect(screen.getByRole("status")).toHaveTextContent("Po odświeżeniu");
    expect(screen.getByRole("status")).toHaveTextContent("ostatniego zapisu");
    rerender(<StorageNotice warning={warning} />); expect(screen.getByRole("status")).toBeVisible();
  });
});

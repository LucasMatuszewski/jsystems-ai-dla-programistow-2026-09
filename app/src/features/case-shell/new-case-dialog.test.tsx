import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { NewCaseDialog } from "./new-case-dialog";

const callbacks = vi.hoisted(() => ({ close: vi.fn() as (open: boolean) => void, restoreFocus: vi.fn() as (event: { preventDefault: () => void }) => void }));
vi.mock("@/components/ui/button", () => ({ Button: ({ children, onClick }: { children: ReactNode; onClick: () => void }) => <button onClick={onClick}>{children}</button> }));
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, onOpenChange, children }: { open: boolean; onOpenChange: (open: boolean) => void; children: ReactNode }) => { callbacks.close = onOpenChange; return open ? children : null; },
  DialogContent: ({ children, onCloseAutoFocus }: { children: ReactNode; onCloseAutoFocus: (event: { preventDefault: () => void }) => void }) => { callbacks.restoreFocus = onCloseAutoFocus; return <div role="dialog">{children}</div>; },
  DialogHeader: ({ children }: { children: ReactNode }) => <header>{children}</header>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
  DialogFooter: ({ children }: { children: ReactNode }) => <footer>{children}</footer>,
}));
beforeEach(() => vi.clearAllMocks());
function setup(open = true) {
  const trigger = document.createElement("button"); const focus = vi.spyOn(trigger, "focus");
  const onOpenChange = vi.fn(); const onConfirm = vi.fn();
  render(<NewCaseDialog open={open} onOpenChange={onOpenChange} onConfirm={onConfirm} triggerRef={{ current: trigger }} />);
  return { onOpenChange, onConfirm, focus };
}
it("requires the explicit Polish confirmation and cancellation preserves the current case", () => {
  const h = setup();
  expect(screen.getByRole("heading", { name: "Rozpocząć nową sprawę?" })).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Anuluj" }));
  expect(h.onOpenChange).toHaveBeenCalledWith(false); expect(h.onConfirm).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Rozpocznij nową sprawę" }));
  expect(h.onConfirm).toHaveBeenCalledTimes(1);
});
it("delegates primitive close requests without confirming and restores focus to the invoking control", () => {
  const h = setup(); const preventDefault = vi.fn();
  callbacks.close(false);
  expect(h.onOpenChange).toHaveBeenCalledWith(false); expect(h.onConfirm).not.toHaveBeenCalled();
  callbacks.restoreFocus({ preventDefault });
  expect(preventDefault).toHaveBeenCalledTimes(1); expect(h.focus).toHaveBeenCalledTimes(1);
});
it("does not render confirmation controls while closed", () => {
  setup(false); expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
});

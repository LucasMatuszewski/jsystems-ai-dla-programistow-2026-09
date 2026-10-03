import { fireEvent, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { ReplyStatus } from "./reply-status";
it("offers a keyboard-accessible explicit retry, disabled until the previous attempt settles", () => {
  const onRetry = vi.fn();
  const { rerender } = render(<ReplyStatus waiting onRetry={onRetry} />);
  const button = screen.getByRole("button", { name: "Ponów odpowiedź" });
  expect(button).toBeDisabled(); fireEvent.click(button); expect(onRetry).not.toHaveBeenCalled();
  rerender(<ReplyStatus waiting={false} onRetry={onRetry} />);
  button.focus(); expect(button).toHaveFocus(); fireEvent.click(button); expect(onRetry).toHaveBeenCalledOnce();
  expect(document.body.textContent).not.toMatch(/retry|model|operationId/i);
});

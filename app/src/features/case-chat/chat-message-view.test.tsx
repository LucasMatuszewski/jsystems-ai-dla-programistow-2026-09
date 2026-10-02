import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChatMessageView, CHAT_ASSESSMENT_NOTICE } from "./chat-message-view";
describe("safe Polish chat bubbles", () => {
  it.each(["streaming", "complete", "failed", "interrupted"] as const)("shows the fixed assistant notice in %s replies", state => {
    render(<ChatMessageView message={{ id: "reply", role: "assistant", parts: [{ type: "text", text: "Treść odpowiedzi" }] }} state={state} />);
    expect(screen.getByText(CHAT_ASSESSMENT_NOTICE)).toBeVisible();
    if (state === "failed" || state === "interrupted") expect(screen.getByText("Ta odpowiedź nie została ukończona.")).toBeVisible();
  });
  it("renders real Markdown while disabling interpretation of raw HTML", () => {
    const { container } = render(<ChatMessageView message={{ id: "reply", role: "assistant", parts: [{ type: "text", text: '**Ważne ustalenie**\n\n<img src="x" onerror="alert(1)">\n\n<script>alert(1)</script>\n\n<div data-raw="bad">Surowe HTML</div>' }] }} state="complete" />);
    expect(screen.getByText("Ważne ustalenie").outerHTML).toContain('data-streamdown="strong"');
    expect(container.querySelector('img, script, [data-raw="bad"]')).toBeNull();
  });
  it("renders employee text without an assistant notice", () => {
    render(<ChatMessageView message={{ id: "user", role: "user", parts: [{ type: "text", text: "Pytanie pracownika" }] }} />);
    expect(screen.getByText("Pracownik")).toBeVisible(); expect(screen.getByText("Pytanie pracownika")).toBeVisible();
    expect(screen.queryByText(CHAT_ASSESSMENT_NOTICE)).not.toBeInTheDocument();
  });
  it("keeps Markdown tables without copy, download or export controls", () => {
    render(<ChatMessageView message={{ id: "reply", role: "assistant", parts: [{ type: "text", text: "| Ustalenie | Stan |\n| --- | --- |\n| Sprzęt | Do sprawdzenia |" }] }} state="complete" />);
    expect(screen.getByRole("table")).toBeVisible();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

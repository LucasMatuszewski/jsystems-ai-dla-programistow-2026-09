import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PromptInput, PromptInputTextarea } from "./prompt-input";
describe("explicit text-only composer", () => {
  it("removes file inputs and makes file paste/drop inert while retaining text submission", async () => {
    const submit = vi.fn(); const create = vi.spyOn(URL, "createObjectURL");
    const { container } = render(<PromptInput {...{ textOnly: true }} globalDrop onSubmit={submit}><PromptInputTextarea aria-label="Wiadomość" /><button type="submit">Wyślij wiadomość</button></PromptInput>);
    expect(container.querySelector('input[type="file"]')).toBeNull();
    const file = new File(["image"], "photo.png", { type: "image/png" });
    fireEvent.paste(screen.getByRole("textbox"), { clipboardData: { items: [{ kind: "file", getAsFile: () => file }] } });
    expect(fireEvent.drop(container.querySelector("form")!, { dataTransfer: { types: ["Files"], files: [file] } })).toBe(false);
    fireEvent.drop(document, { dataTransfer: { types: ["Files"], files: [file] } });
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "Pytanie tekstowe" } });
    fireEvent.click(screen.getByRole("button", { name: "Wyślij wiadomość" }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ text: "Pytanie tekstowe", files: [] }, expect.anything()));
    expect(create).not.toHaveBeenCalled();
  });
  it("preserves general component upload behavior by default", () => {
    const { container } = render(<PromptInput onSubmit={vi.fn()}><PromptInputTextarea /></PromptInput>);
    expect(container.querySelector('input[type="file"]')).not.toBeNull();
  });
});

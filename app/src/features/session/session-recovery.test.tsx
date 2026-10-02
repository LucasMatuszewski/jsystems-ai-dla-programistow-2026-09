import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SessionRecovery } from "./session-recovery";
describe("explicit local session recovery confirmation", () => {
  it("opens without discarding, focuses safe cancel, dismisses with Escape and returns focus", async () => {
    const confirm = vi.fn(); render(<SessionRecovery onConfirm={confirm} error={null} />);
    const trigger = screen.getByRole("button", { name: "Wyczy\u015b\u0107 zapis i rozpocznij now\u0105 spraw\u0119" }); fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Usun\u0105\u0107 nieczytelny zapis?" });
    expect(dialog).toHaveTextContent("Wszystkie zapisane sprawy tej aplikacji");
    await waitFor(() => expect(screen.getByRole("button", { name: "Anuluj" })).toHaveFocus());
    fireEvent.keyDown(dialog, { key: "Escape" }); await waitFor(() => expect(trigger).toHaveFocus()); expect(confirm).not.toHaveBeenCalled();
  });
  it("calls the explicit confirm once and shows only the supplied safe Polish error", async () => {
    const confirm = vi.fn(); render(<SessionRecovery onConfirm={confirm} error={"Od\u015bwie\u017c stron\u0119, aby sprawdzi\u0107 zapis."} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Od\u015bwie\u017c stron\u0119");
    fireEvent.click(screen.getByRole("button", { name: "Wyczy\u015b\u0107 zapis i rozpocznij now\u0105 spraw\u0119" }));
    fireEvent.click(await screen.findByRole("button", { name: "Usu\u0144 zapis i rozpocznij now\u0105 spraw\u0119" })); expect(confirm).toHaveBeenCalledTimes(1);
  });
});

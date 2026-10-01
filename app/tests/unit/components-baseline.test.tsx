import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputBody, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from "@/components/ai-elements/prompt-input";

describe("selected official component baseline", () => {
  it("associates Polish labels with editable inputs and preserves disabled buttons", () => {
    const submit = vi.fn();
    render(<Card><CardTitle>Dane zakupu</CardTitle><CardContent>
      <Label htmlFor="product">Nazwa produktu</Label><Input id="product" />
      <Label htmlFor="details">Opis problemu</Label><Textarea id="details" />
      <Button disabled onClick={submit}>Dalej</Button>
    </CardContent></Card>);
    fireEvent.change(screen.getByLabelText("Nazwa produktu"), { target: { value: "Telefon" } });
    fireEvent.change(screen.getByLabelText("Opis problemu"), { target: { value: "Pęknięty ekran" } });
    expect(screen.getByLabelText("Nazwa produktu")).toHaveValue("Telefon");
    expect(screen.getByLabelText("Opis problemu")).toHaveValue("Pęknięty ekran");
    fireEvent.click(screen.getByRole("button", { name: "Dalej" }));
    expect(submit).not.toHaveBeenCalled();
  });

  it("exposes alert content and toggle state to assistive technology", () => {
    render(<><Alert><AlertTitle>Uwaga</AlertTitle><AlertDescription>Sprawdź dane.</AlertDescription></Alert>
      <Collapsible><CollapsibleTrigger>Warunki reklamacji</CollapsibleTrigger><CollapsibleContent>Masz prawo do reklamacji.</CollapsibleContent></Collapsible></>);
    expect(screen.getByRole("alert")).toHaveTextContent("Sprawdź dane.");
    const trigger = screen.getByRole("button", { name: "Warunki reklamacji" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Masz prawo do reklamacji.")).toBeVisible();
  });

  it("provides a labelled select and its initial selection", () => {
    render(<Select defaultValue="damaged"><SelectTrigger aria-label="Powód reklamacji"><SelectValue /></SelectTrigger>
      <SelectContent><SelectItem value="damaged">Uszkodzony produkt</SelectItem><SelectItem value="wrong">Inny produkt</SelectItem></SelectContent></Select>);
    expect(screen.getByRole("combobox", { name: "Powód reklamacji" })).toHaveTextContent("Uszkodzony produkt");
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-expanded", "false");
  });

  it("opens an accessible confirmation and returns focus after cancellation", async () => {
    render(<AlertDialog><AlertDialogTrigger>Nowa rozmowa</AlertDialogTrigger><AlertDialogContent>
      <AlertDialogTitle>Rozpocząć nową rozmowę?</AlertDialogTitle><AlertDialogDescription>Obecne dane zostaną usunięte.</AlertDialogDescription>
      <AlertDialogCancel>Anuluj</AlertDialogCancel>
    </AlertDialogContent></AlertDialog>);
    const trigger = screen.getByRole("button", { name: "Nowa rozmowa" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(await screen.findByRole("alertdialog", { name: "Rozpocząć nową rozmowę?" })).toHaveAccessibleDescription("Obecne dane zostaną usunięte.");
    fireEvent.click(screen.getByRole("button", { name: "Anuluj" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument());
    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("renders response Markdown while preserving readable message content", () => {
    render(<Message from="assistant"><MessageContent><MessageResponse>{"Sprawdź **numer zamówienia**."}</MessageResponse></MessageContent></Message>);
    expect(screen.getByText("numer zamówienia")).toBeVisible();
    expect(screen.queryByText("Sprawdź **numer zamówienia**.")).not.toBeInTheDocument();
  });

  it("submits a labelled text composer on Enter, clears it, and keeps Shift+Enter unsent", async () => {
    const submit = vi.fn();
    render(<PromptInput onSubmit={submit}><PromptInputBody>
      <PromptInputTextarea aria-label="Wiadomość" placeholder="Napisz wiadomość" />
    </PromptInputBody><PromptInputFooter><PromptInputSubmit aria-label="Wyślij wiadomość" /></PromptInputFooter></PromptInput>);
    const textarea = screen.getByRole("textbox", { name: "Wiadomość" });
    fireEvent.change(textarea, { target: { value: "Jak złożyć reklamację?" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(submit).not.toHaveBeenCalled();
    fireEvent.keyDown(textarea, { key: "Enter" });
    await waitFor(() => expect(submit).toHaveBeenCalledWith({ text: "Jak złożyć reklamację?", files: [] }, expect.anything()));
    await waitFor(() => expect(textarea).toHaveValue(""));
  });

  it("blocks Enter submission when the composer submit control is disabled", () => {
    const submit = vi.fn();
    render(<PromptInput onSubmit={submit}><PromptInputTextarea aria-label="Wiadomość" placeholder="Napisz wiadomość" />
      <PromptInputSubmit aria-label="Wyślij wiadomość" disabled /></PromptInput>);
    const textarea = screen.getByRole("textbox", { name: "Wiadomość" });
    fireEvent.change(textarea, { target: { value: "Pytanie" } });
    fireEvent.keyDown(textarea, { key: "Enter" });
    expect(submit).not.toHaveBeenCalled();
    expect(textarea).toHaveValue("Pytanie");
  });
});

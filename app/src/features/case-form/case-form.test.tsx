import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement, useState, type ComponentProps } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FORM_OPTIONS, createCaseFormSchema, type CaseForm as ValidatedCaseForm } from "@/lib/contracts/form";
import { getEmployeeToday } from "@/lib/contracts/calendar";
import { CaseForm, type CaseFormValues } from "./case-form";

const validation = vi.hoisted(() => ({ parse: vi.fn(), errors: vi.fn(), today: vi.fn() }));

vi.mock("@/lib/contracts/form", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/contracts/form")>(),
  createCaseFormSchema: vi.fn(() => ({ safeParse: validation.parse })),
  getFormFieldErrors: validation.errors,
}));
vi.mock("@/lib/contracts/calendar", () => ({ getEmployeeToday: validation.today }));
vi.mock("@/components/ui/input", () => ({ Input: (props: ComponentProps<"input">) => createElement("input", props) }));
vi.mock("@/components/ui/label", () => ({ Label: (props: ComponentProps<"label">) => createElement("label", props) }));
vi.mock("@/components/ui/textarea", () => ({ Textarea: (props: ComponentProps<"textarea">) => createElement("textarea", props) }));
vi.mock("@/components/ui/button", () => ({ Button: (props: ComponentProps<"button">) => createElement("button", props) }));

const empty: CaseFormValues = {
  scenario: "", category: "", equipmentName: "", purchaseDate: "", deliveryDate: "",
  buyerStatus: "", sellerStatus: "", reason: "", requestedRemedy: "",
};
const complete: CaseFormValues = {
  scenario: "complaint", category: "smartphones-tablets", equipmentName: "Telefon",
  purchaseDate: "2026-09-01", deliveryDate: "2026-09-02", buyerStatus: "consumer",
  sellerStatus: "business", reason: "Pęknięty ekran", requestedRemedy: "repair",
};

function Harness({ initial = empty, submit = vi.fn(), change = vi.fn() }: {
  initial?: CaseFormValues;
  submit?: (value: ValidatedCaseForm) => void;
  change?: (value: CaseFormValues) => void;
}) {
  const [value, setValue] = useState(initial);
  return <CaseForm value={value} onChange={(next) => { change(next); setValue(next); }} onValidSubmit={submit} />;
}

function rejectField(field: string, message: string) {
  validation.parse.mockReturnValue({ success: false, error: { issues: [{ code: "custom", path: [field], message }] } });
  validation.errors.mockReturnValue({ [field]: [message] });
}

beforeEach(() => {
  validation.today.mockReturnValue("2026-10-01");
  validation.parse.mockImplementation((candidate) => ({ success: true, data: candidate }));
  validation.errors.mockReturnValue({});
});

describe("controlled conditional case form", () => {
  it("starts without a selected scenario or implicit unknown answers", () => {
    render(<Harness />);
    expect(screen.getByRole("group", { name: "Rodzaj sprawy" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Reklamacja" })).not.toBeChecked();
    expect(screen.getByRole("radio", { name: "Zwrot" })).not.toBeChecked();
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByLabelText("Kategoria sprzętu")).toHaveValue("");
    expect(screen.getByLabelText("Status kupującego")).toHaveValue("");
    expect(screen.getByLabelText("Status sprzedawcy")).toHaveValue("");
    expect(screen.getByRole("checkbox", { name: "Nie znam daty dostarczenia" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: "Dalej" })).toBeInTheDocument();
  });

  it("uses the authoritative category and status option labels", () => {
    render(<Harness />);
    for (const [label, options] of [
      ["Kategoria sprzętu", FORM_OPTIONS.category], ["Status kupującego", FORM_OPTIONS.buyerStatus],
      ["Status sprzedawcy", FORM_OPTIONS.sellerStatus],
    ] as const) {
      const select = screen.getByLabelText(label);
      for (const option of options) expect(select).toHaveTextContent(option.label);
      expect(select.querySelectorAll("option[value]:not([value=''])")).toHaveLength(options.length);
    }
  });

  it("exposes native date controls and controlled raw values without trimming edits", () => {
    const change = vi.fn();
    render(<Harness change={change} />);
    expect(screen.getByLabelText("Data zakupu")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("Data dostarczenia")).toHaveAttribute("type", "date");
    fireEvent.change(screen.getByLabelText("Nazwa sprzętu"), { target: { value: "  Telefon  " } });
    expect(change).toHaveBeenLastCalledWith({ ...empty, equipmentName: "  Telefon  " });
    expect(screen.getByLabelText("Nazwa sprzętu")).toHaveValue("  Telefon  ");
  });

  it("shows the five remedies only for complaints and clears the raw remedy on switching to return", () => {
    const change = vi.fn();
    render(<Harness initial={complete} change={change} />);
    const remedy = screen.getByLabelText("Oczekiwane rozwiązanie");
    for (const option of FORM_OPTIONS.requestedRemedy) expect(remedy).toHaveTextContent(option.label);
    expect(remedy.querySelectorAll("option[value]:not([value=''])")).toHaveLength(5);
    fireEvent.click(screen.getByRole("radio", { name: "Zwrot" }));
    expect(screen.queryByLabelText("Oczekiwane rozwiązanie")).not.toBeInTheDocument();
    expect(change).toHaveBeenLastCalledWith({ ...complete, scenario: "return", requestedRemedy: null });
    expect(screen.getByLabelText("Nazwa sprzętu")).toHaveValue("Telefon");
    expect(screen.getByLabelText("Przyczyna zgłoszenia")).toHaveValue("Pęknięty ekran");
  });

  it("represents explicit unknown delivery as null and requires a date again when unchecked", () => {
    const change = vi.fn();
    render(<Harness initial={complete} change={change} />);
    fireEvent.click(screen.getByRole("checkbox", { name: "Nie znam daty dostarczenia" }));
    expect(change).toHaveBeenLastCalledWith({ ...complete, deliveryDate: null });
    expect(screen.getByLabelText("Data dostarczenia")).toBeDisabled();
    fireEvent.click(screen.getByRole("checkbox", { name: "Nie znam daty dostarczenia" }));
    expect(screen.getByLabelText("Data dostarczenia")).not.toBeDisabled();
    expect(change.mock.lastCall?.[0].deliveryDate).toEqual(expect.any(String));
  });

  it("validates with today's date in the browser IANA zone and emits the parsed result exactly", () => {
    const submit = vi.fn();
    const raw = { ...complete, equipmentName: "  Telefon  ", reason: "  Pęknięty ekran  " };
    const parsed = { ...complete } as ValidatedCaseForm;
    validation.parse.mockReturnValue({ success: true, data: parsed });
    render(<Harness initial={raw} submit={submit} />);
    fireEvent.click(screen.getByRole("button", { name: "Dalej" }));
    expect(getEmployeeToday).toHaveBeenCalledWith(Intl.DateTimeFormat().resolvedOptions().timeZone);
    expect(createCaseFormSchema).toHaveBeenCalledWith("2026-10-01");
    expect(validation.parse).toHaveBeenCalledWith(raw);
    expect(submit).toHaveBeenCalledExactlyOnceWith(parsed);
  });

  it("submits a return with an optional empty reason and no stale complaint remedy", () => {
    const submit = vi.fn();
    const raw = { ...complete, scenario: "return" as const, reason: "", requestedRemedy: "replacement" as const, deliveryDate: null };
    const candidate = { ...raw, requestedRemedy: null };
    validation.parse.mockReturnValue({ success: true, data: candidate });
    render(<Harness initial={raw} submit={submit} />);
    fireEvent.click(screen.getByRole("button", { name: "Dalej" }));
    expect(validation.parse).toHaveBeenCalledWith(candidate);
    expect(submit).toHaveBeenCalledExactlyOnceWith(candidate);
  });

  it("blocks missing scenario and focuses the scenario choice", async () => {
    const submit = vi.fn();
    rejectField("scenario", "Wybierz rodzaj sprawy.");
    render(<Harness submit={submit} />);
    fireEvent.click(screen.getByRole("button", { name: "Dalej" }));
    expect(await screen.findByText("Wybierz rodzaj sprawy.")).toBeVisible();
    expect(submit).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByRole("radio", { name: "Reklamacja" })).toHaveFocus());
  });

  it.each([
    ["equipmentName", "Nazwa sprzętu", "   ", "Podaj nazwę sprzętu."],
    ["purchaseDate", "Data zakupu", "2026-10-02", "Data zakupu nie może być późniejsza niż dzisiaj."],
    ["deliveryDate", "Data dostarczenia", "2026-08-31", "Data dostarczenia nie może być wcześniejsza niż data zakupu."],
    ["deliveryDate", "Data dostarczenia", "2026-10-02", "Data dostarczenia nie może być późniejsza niż dzisiaj."],
    ["reason", "Przyczyna zgłoszenia", "  ", "Podaj przyczynę reklamacji."],
  ])("associates the %s failure, preserves edits and focuses the invalid control", async (field, label, entered, message) => {
    const submit = vi.fn();
    rejectField(field, message);
    render(<Harness initial={{ ...complete, [field]: entered }} submit={submit} />);
    fireEvent.click(screen.getByRole("button", { name: "Dalej" }));
    const control = screen.getByLabelText(label);
    expect(await screen.findByText(message)).toBeVisible();
    expect(control).toHaveAttribute("aria-invalid", "true");
    expect(control).toHaveAccessibleDescription(message);
    expect(control).toHaveValue(entered);
    expect(screen.getByLabelText("Nazwa sprzętu")).toHaveValue(field === "equipmentName" ? entered : "Telefon");
    expect(submit).not.toHaveBeenCalled();
    await waitFor(() => expect(control).toHaveFocus());
  });

  it("focuses the first invalid field in form order and retains the remaining errors", async () => {
    validation.parse.mockReturnValue({ success: false, error: { issues: [
      { code: "custom", path: ["reason"], message: "Podaj przyczynę reklamacji." },
      { code: "custom", path: ["equipmentName"], message: "Podaj nazwę sprzętu." },
    ] } });
    validation.errors.mockReturnValue({ reason: ["Podaj przyczynę reklamacji."], equipmentName: ["Podaj nazwę sprzętu."] });
    render(<Harness initial={complete} />);
    fireEvent.click(screen.getByRole("button", { name: "Dalej" }));
    await waitFor(() => expect(screen.getByLabelText("Nazwa sprzętu")).toHaveFocus());
    expect(screen.getByText("Podaj przyczynę reklamacji.")).toBeVisible();
    expect(screen.getByLabelText("Przyczyna zgłoszenia")).toHaveAccessibleDescription("Podaj przyczynę reklamacji.");
  });
});

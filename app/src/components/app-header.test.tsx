import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { createElement, type ComponentProps, type ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { AppHeader } from "./app-header";
import Home from "../app/page";

vi.mock("next/image", () => ({
  default: ({ src, alt, width, height, className }: ComponentProps<"img">) =>
    createElement("img", { src, alt, width, height, className }),
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

describe("Polish application header", () => {
  it("explains the preliminary employee assessment and personal-information boundary", () => {
    render(<Home />);
    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
    expect(screen.getByRole("heading", { name: "Wstępna ocena sprawy", level: 1 })).toBeVisible();
    expect(screen.getByText(/pomaga pracownikowi/)).toHaveTextContent("nie jest ostateczną decyzją");
    expect(screen.getByText(/Nie wprowadzaj danych osobowych klientów/)).toBeVisible();
  });

  it("warns employees to exclude personal information from descriptions and photographs", () => {
    render(<Home />);
    expect(screen.getByText(/Nie umieszczaj danych osobowych w opisach ani na zdjęciach/)).toBeVisible();
  });
  it("identifies the employee assistant with the original local Allegro logo", () => {
    render(<AppHeader />);
    expect(screen.getByRole("banner")).toHaveTextContent("Asystent reklamacji i zwrotów");
    expect(screen.getByRole("img", { name: "Allegro" })).toHaveAttribute("src", "/brand/logo.svg");
  });

  it("offers a keyboard shortcut to the main content without unavailable case or storefront actions", () => {
    render(<AppHeader />);
    const skip = screen.getByRole("link", { name: "Przejdź do treści" });
    expect(skip).toHaveAttribute("href", "#main-content");
    skip.focus();
    expect(skip).toHaveFocus();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
  });

  it("serves an exact copy of the approved wordmark rather than a reconstructed identity", () => {
    expect(readFileSync(resolve("public/brand/logo.svg"))).toEqual(readFileSync(resolve("../assets/logo.svg")));
  });
});

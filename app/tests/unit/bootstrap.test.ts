import { describe, expect, it } from "vitest";
import manifest from "../../package.json";
import tsconfig from "../../tsconfig.json";

describe("browser-safe unit runner", () => {
  it("resolves the application's @ alias in the inherited project configuration", async () => {
    const page = await import("@/app/page");
    expect(page.default).toBeTypeOf("function");
  });

  it("provides a local DOM and DOM assertions", () => {
    const button = document.createElement("button");
    button.textContent = "Kontynuuj";
    document.body.append(button);
    expect(button).toBeInTheDocument();
    expect(button).toHaveAccessibleName("Kontynuuj");
    expect(window.location.origin).toBe("http://127.0.0.1:3000");
    button.remove();
  });
});

describe("developer verification contract", () => {
  it.each([
    ["test:unit", "vitest run --config vitest.unit.config.ts"],
    ["test:integration", "vitest run --config vitest.integration.config.ts"],
  ])("exposes %s as a single scoped run", (name, command) => {
    expect((manifest.scripts as Record<string, string>)[name]).toBe(command);
  });

  it("keeps strict checking and development bound to the local interface", () => {
    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(manifest.scripts.typecheck).toBe("tsc --noEmit");
    expect(manifest.scripts.dev).toBe("next dev --hostname 127.0.0.1 --port 3000");
    expect(manifest.scripts.lint).toBe("eslint . --max-warnings 0");
  });
});

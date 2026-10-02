// @vitest-environment node
import { describe, expect, it } from "vitest";
import { composite, contrastRatio, minimumTextContrast, parseCssColor, passesTextContrast } from "../../e2e/helpers/text-contrast";

describe("WCAG text contrast observations", () => {
  it("calculates reference luminance ratios without rounding decisions", () => {
    expect(contrastRatio(parseCssColor("rgb(0, 0, 0)"), parseCssColor("rgb(255, 255, 255)"))).toBe(21);
    expect(contrastRatio(parseCssColor("rgb(255, 90, 0)"), parseCssColor("rgb(255, 255, 255)"))).toBeCloseTo(3.1279, 3);
    expect(passesTextContrast(4.499999, 16, 700)).toBe(false);
    expect(passesTextContrast(4.5, 16, 700)).toBe(true);
  });
  it("composites alpha paint before contrast calculation", () => {
    const background = parseCssColor("rgb(255, 255, 255)");
    const mixed = composite(parseCssColor("color(srgb 1 0.35294117647058826 0 / 0.8)"), background);
    expect(mixed.r).toBe(1);
    expect(mixed.g).toBeCloseTo(0.4823529411764706, 12);
    expect(mixed.b).toBeCloseTo(0.2, 12);
    expect(mixed.a).toBe(1);
    expect(contrastRatio(mixed, background)).toBeLessThan(contrastRatio(parseCssColor("rgb(255 90 0)"), background));
    expect(composite(parseCssColor("rgba(0, 0, 0, 0)"), background)).toEqual(background);
  });
  it("reads both computed RGB syntax and color(srgb) percentages", () => {
    expect(parseCssColor("rgb(100% 0% 50% / 25%)")).toEqual({ r: 1, g: 0, b: 0.5, a: 0.25 });
    expect(parseCssColor("color(srgb 100% 0% 50% / 25%)")).toEqual({ r: 1, g: 0, b: 0.5, a: 0.25 });
    expect(() => parseCssColor("unresolved-color-expression")).toThrow();
  });
  it("converts resolved Oklab hover paint to sRGB while retaining its alpha", () => {
    const orange = parseCssColor("oklab(0.681422 0.1635 0.137481 / 0.8)");
    expect(orange.r).toBeCloseTo(1, 5);
    // Browser serialization rounds Oklab components; compare within one sRGB code step.
    expect(Math.abs(orange.g - 90 / 255)).toBeLessThan(1 / 255);
    expect(orange.b).toBeCloseTo(0, 5);
    expect(orange.a).toBe(0.8);
    const neutral = parseCssColor("oklab(50% 0 0)");
    expect(neutral.r).toBeCloseTo(0.3885728590463344, 10);
    expect(neutral.g).toBeCloseTo(neutral.r, 10);
    expect(neutral.b).toBeCloseTo(neutral.r, 10);
  });
  it("uses the large-text exception only at the exact size and weight threshold", () => {
    expect(minimumTextContrast(16, 700)).toBe(4.5);
    expect(minimumTextContrast(18.6666, 700)).toBe(4.5);
    expect(minimumTextContrast(14 * 96 / 72, 700)).toBe(3);
    expect(minimumTextContrast(18.6667, 700)).toBe(3);
    expect(minimumTextContrast(23.9999, 400)).toBe(4.5);
    expect(minimumTextContrast(24, 400)).toBe(3);
    expect(minimumTextContrast(18.6667, 699)).toBe(4.5);
  });
});

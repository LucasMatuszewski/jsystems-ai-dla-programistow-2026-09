import type { Locator } from "@playwright/test";

export interface Color { r: number; g: number; b: number; a: number }
const clamp = (value: number) => Math.max(0, Math.min(1, value));
function component(value: string, scale = 1): number {
  const number = Number.parseFloat(value);
  if (!Number.isFinite(number)) throw new Error("Unsupported computed color component");
  return clamp(value.endsWith("%") ? number / 100 : number / scale);
}
function fromOklab(lightness: number, a: number, b: number, alpha: number): Color {
  // CSS Color 4 conversion matrices, D65; no pixel sampling or 8-bit quantization.
  // https://www.w3.org/TR/css-color-4/#color-conversion-code
  const lms = [lightness + 0.3963377773761749 * a + 0.2158037573099136 * b,
    lightness - 0.1055613458156586 * a - 0.0638541728258133 * b,
    lightness - 0.0894841775298119 * a - 1.2914855480194092 * b].map(value => value ** 3);
  const multiply = (matrix: number[][], values: number[]) => matrix.map(row => row.reduce((sum, coefficient, index) => sum + coefficient * values[index], 0));
  const xyz = multiply([[1.2268798758459243, -0.5578149944602171, 0.2813910456659647], [-0.0405757452148008, 1.1122868032803170, -0.0717110580655164], [-0.0763729366746601, -0.4214933324022432, 1.5869240198367816]], lms);
  const linear = multiply([[12831 / 3959, -329 / 214, -1974 / 3959], [-851781 / 878810, 1648619 / 878810, 36519 / 878810], [705 / 12673, -2585 / 12673, 705 / 667]], xyz);
  const encoded = linear.map(value => clamp(value <= 0.0031308 ? 12.92 * value : 1.055 * value ** (1 / 2.4) - 0.055));
  return { r: encoded[0], g: encoded[1], b: encoded[2], a: alpha };
}
/** Actual computed RGB, srgb and Oklab color-mix syntax. */
export function parseCssColor(value: string): Color {
  if (value === "transparent") return { r: 0, g: 0, b: 0, a: 0 };
  const rgb = /^rgba?\((.+)\)$/i.exec(value.trim());
  const srgb = /^color\(srgb\s+(.+)\)$/i.exec(value.trim());
  const oklab = /^oklab\((.+)\)$/i.exec(value.trim());
  if (!rgb && !srgb && !oklab) throw new Error("Unsupported computed CSS color syntax");
  const pieces = (rgb?.[1] ?? srgb?.[1] ?? oklab![1]).replaceAll(",", " ").replaceAll("/", " ").trim().split(/\s+/);
  if (pieces.length !== 3 && pieces.length !== 4) throw new Error("Unsupported computed CSS color syntax");
  const alpha = pieces[3] === undefined ? 1 : component(pieces[3]);
  if (oklab) {
    const axes = pieces.slice(1, 3).map(piece => Number.parseFloat(piece) * (piece.endsWith("%") ? 0.004 : 1));
    if (axes.some(axis => !Number.isFinite(axis))) throw new Error("Unsupported computed color component");
    return fromOklab(component(pieces[0]), axes[0], axes[1], alpha);
  }
  const scale = rgb ? 255 : 1;
  return { r: component(pieces[0], scale), g: component(pieces[1], scale), b: component(pieces[2], scale), a: alpha };
}
export function composite(foreground: Color, background: Color): Color {
  const a = foreground.a + background.a * (1 - foreground.a);
  if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
  const blend = (front: number, back: number) => (front * foreground.a + back * background.a * (1 - foreground.a)) / a;
  return { r: blend(foreground.r, background.r), g: blend(foreground.g, background.g), b: blend(foreground.b, background.b), a };
}
function luminance(value: Color): number {
  const linear = (v: number) => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  return 0.2126 * linear(value.r) + 0.7152 * linear(value.g) + 0.0722 * linear(value.b);
}
export function contrastRatio(a: Color, b: Color): number {
  const first = luminance(a), second = luminance(b);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
export function minimumTextContrast(fontSize: number, fontWeight: number): number {
  return fontSize >= 24 || (fontSize >= 14 * 96 / 72 && fontWeight >= 700) ? 3 : 4.5;
}
export function passesTextContrast(ratio: number, fontSize: number, fontWeight: number): boolean {
  return ratio >= minimumTextContrast(fontSize, fontWeight);
}
export async function observeTextContrast(locator: Locator) {
  const sample = await locator.evaluate(element => {
    const text = getComputedStyle(element);
    const layers: { background: string; opacity: number }[] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      const style = getComputedStyle(node);
      if (style.backgroundImage !== "none") throw new Error("Text contrast requires a solid observed background");
      layers.push({ background: style.backgroundColor, opacity: Number(style.opacity) });
    }
    return { foreground: text.color, fontSize: Number.parseFloat(text.fontSize), fontWeight: Number.parseFloat(text.fontWeight), layers };
  });
  let ink = parseCssColor(sample.foreground);
  let background: Color = { r: 0, g: 0, b: 0, a: 0 };
  // Source-over from target to painted ancestors, including group opacity.
  for (const layer of sample.layers) {
    const paint = parseCssColor(layer.background);
    ink = composite(ink, paint); background = composite(background, paint);
    ink = { ...ink, a: ink.a * layer.opacity }; background = { ...background, a: background.a * layer.opacity };
  }
  const canvas: Color = { r: 1, g: 1, b: 1, a: 1 };
  ink = composite(ink, canvas); background = composite(background, canvas);
  return { ...sample, paintedForeground: ink, paintedBackground: background, ratio: contrastRatio(ink, background), minimum: minimumTextContrast(sample.fontSize, sample.fontWeight) };
}

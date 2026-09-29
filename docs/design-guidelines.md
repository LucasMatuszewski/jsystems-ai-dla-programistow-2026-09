# Onet homepage design reference

Source: [onet.pl](https://www.onet.pl/), observed on 2026-09-29 at desktop width 1265px after dismissing consent and onboarding. This is a reference to the observed homepage, not a license to reproduce the brand or its editorial content. Advertising creative, anniversary artwork, stories, and their colors change over time.

## Assets

| Asset | Use |
| --- | --- |
| [Design tokens](../assets/design-tokens.json) | Machine-readable observed values. |
| [Homepage screenshot](../assets/homepage.png) | Full-page visual reference; some lower images are lazy-loaded placeholders. |
| [Favicon](../assets/favicon.png) | 16 × 16 yellow Onet icon. |
| [Anniversary header image](../assets/anniversary-header.png) | Campaign-specific static frame; **not** a complete standalone Onet wordmark. |
| [Fira Sans Regular](../assets/fonts/fira-sans/FiraSans-Regular.woff2) | Local font file, weight 400. |
| [Fira Sans Medium](../assets/fonts/fira-sans/FiraSans-Medium.woff2) | Local font file, weight 500. |
| [Fira Sans Bold](../assets/fonts/fira-sans/FiraSans-Bold.woff2) | Local font file, weight 700. |

Verify the licenses and usage rights of the downloaded fonts, favicon, and anniversary image **before use or redistribution**.

## Colors

| Token | Value | Usage |
| --- | --- | --- |
| `colors.brand.primary` | `#FFD200` | Onet yellow: brand marks and section accents. |
| `colors.brand.accent` | `#1E1E1E` | Dark subscription pill and emphasis. |
| `colors.brand.error` | `#CC0000` | Error/negative text color observed on the page; not a general CTA. |
| `colors.brand.success` | `#339900` | Positive status text observed on the page. |
| `colors.background.default` | `#FFFFFF` | Page and header. |
| `colors.background.light` | `#F4F3EE` | Warm off-white panels. |
| `colors.background.placeholder` | `#EAEAEA` | Unloaded media placeholders. |
| `colors.background.dark` | `#191919` | Dark media and promo surfaces. |
| `colors.background.overlay` | `rgba(0, 0, 0, 0.3)` | Image overlay where needed. |
| `colors.text.primary` | `#1E1E1E` | Headlines and controls. |
| `colors.text.secondary` | `#424242` | Secondary text. |
| `colors.text.muted` | `#919191` | Quiet metadata. |
| `colors.text.onDark` | `#FFFFFF` | Text on dark cards. |

Bright red (`#FF0000`) was sampled on a lead story campaign card; it is not a universal brand action color. Browser-default blue links were also present in the DOM and should not be treated as a brand color.

## Typography

The observed body family is `"Fira Sans", Arial, Helvetica, sans-serif`. The site serves these WOFF2 files through its publisher CDN; they were downloaded to:

- `assets/fonts/fira-sans/FiraSans-Regular.woff2` — 400.
- `assets/fonts/fira-sans/FiraSans-Medium.woff2` — 500.
- `assets/fonts/fira-sans/FiraSans-Bold.woff2` — 700.

Verify font licensing before using the local copies. A suitable local declaration, **only after verifying rights**, is:

```css
@font-face {
  font-family: "Fira Sans";
  src: url("../assets/fonts/fira-sans/FiraSans-Regular.woff2") format("woff2");
  font-weight: 400;
}
```

Apply analogous declarations for Medium (500) and Bold (700). Observed type sizes: 11px on follow controls, 12px in the subscription label, 15px section headings, 16px body, 28px prominent card headline, and 32px homepage logo heading container. The observed section-heading line height is 24px; a prominent card headline uses 31px. Do not infer an unobserved universal type scale from these samples.

## Spacing and shape

A practical 4px spacing increment covers 4, 8, 12, 16, 20, 24, and 32px. These are reference increments, not a claim that every Onet layout gap follows the scale. The observed section heading uses `7px 0 10px 14px` padding, a story headline uses `8px 14px`, and the search field uses `6px 82px 6px 42px`.

| Radius | Observed context |
| --- | --- |
| 0px | Rectangular page and header regions. |
| 4px | Small rounded details. |
| 7px | Article card edges. |
| 8px | Weather control. |
| 15px | Follow-author button. |
| 20px | Search field. |
| 24px | Rounded header link/pill. |
| 50% | Circular icons/avatars. |

## Components

- **Header:** white, approximately 101px tall on the captured desktop view; weather/location, a 280 × 36px rounded search field, a dark subscription pill, and service icons.
- **Service navigation:** links and icons in the header; no visible semantic `<nav>` element was found in this capture. Use dark neutral labels, not browser-default blue.
- **Subscription control:** dark `#1E1E1E` pill with white, medium-weight 12px label, approximately 122 × 36px; SVG rect has an 18px corner radius.
- **Follow button:** white background, `#DCDCDC` 1px border, 15px radius, 11px medium-weight dark label.
- **Search input:** rounded 20px container, 36px tall, transparent inner input and search icon at the left.
- **Content cards:** dense editorial grid with strong photo-led hierarchy; some media areas appear gray until lazy-loaded. Example lead card has 7px rounded corners and a 28px bold headline with 31px line height.
- **Section headings:** 15px bold, 24px line height, often accompanied by a short yellow accent.
- **Promo/advertising:** large yellow and dark campaign artwork is prominent in this capture, but creative and content must not be hard-coded as reusable UI components.

## Logo usage

The visible homepage header showed a **30-year animated anniversary doodle**, not an ordinary static Onet wordmark. The saved `anniversary-header.png` is its publisher-hosted poster; it has an empty/dark region intended for the animation and must **not** be used as a complete logo. No reliable standalone or inverted wordmark variant was available from this capture. Use a separately licensed official Onet logo if one is required; never reconstruct one from the screenshot or substitute another publication's logo.

## Visual style

The homepage combines a clean white canvas with strong black typography and highly recognizable yellow accents. Compact editorial modules prioritize headlines, images, and rapid scanning over generous whitespace. Pills soften utility controls, while cards and image surfaces remain mostly square or only slightly rounded. Ads and temporary editorial treatments can add much louder colors than the persistent brand UI. Treat this reference as inspiration for visual consistency, not permission to copy the site's text, layout, or proprietary assets.

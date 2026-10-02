# Allegro desktop design reference

Extracted from [allegro.pl](https://allegro.pl/) on 29 September 2026 with Playwright CLI 0.1.22 and **headed Chrome**, at a 1440 × 1000 CSS-pixel viewport. The reference is the logged-out Polish homepage after consent dismissal and scrolling to load content. These are observed styles and locally named tokens, not an official or exhaustive Allegro design specification.

## Assets

| File | Purpose |
| --- | --- |
| [design-tokens.json](../assets/design-tokens.json) | Semantic colors, type, spacing and measured components |
| [design-source.json](../assets/design-source.json) | Computed-style evidence, font declarations and original asset URLs |
| [homepage.png](../assets/homepage.png) | Full-page desktop reference, with consent and overlays dismissed |
| [homepage-desktop.png](../assets/homepage-desktop.png) | Readable first-viewport reference |
| [logo.svg](../assets/logo.svg) | Original orange Allegro wordmark |
| [logo-inverted.svg](../assets/logo-inverted.svg) | Original white footer wordmark |
| [favicon.ico](../assets/favicon.ico) | Original site favicon |
| [Inter 300](../assets/fonts/inter/inter-300_6e675dc7.woff2) | `assets/fonts/inter/inter-300_6e675dc7.woff2` |
| [Inter 400](../assets/fonts/inter/inter-400_ff6a2a72.woff2) | `assets/fonts/inter/inter-400_ff6a2a72.woff2` |
| [Inter 500](../assets/fonts/inter/inter-500_16fd771f.woff2) | `assets/fonts/inter/inter-500_16fd771f.woff2` |
| [Inter 700](../assets/fonts/inter/inter-700_460e5670.woff2) | `assets/fonts/inter/inter-700_460e5670.woff2` |
| [Open Sans variable](../assets/fonts/open-sans/open-sans_6cc28a8e.woff2) | `assets/fonts/open-sans/open-sans_6cc28a8e.woff2` |
| [Roboto variable](../assets/fonts/roboto/roboto_e4451a57.woff2) | `assets/fonts/roboto/roboto_e4451a57.woff2` |

Fonts were served by Allegro's own asset CDN, `assets.allegrostatic.com`, and fetched through the page's browser context. Logos came from `a.allegroimg.com` and `assets.allegrostatic.com`; the favicon came from `allegro.pl`. Verify font licenses and permission to use or redistribute the wordmarks, favicon and screenshot content before reuse.

## Colors

| Token | Value | Observed use |
| --- | --- | --- |
| `brand.primary` | `#FF5A00` | Wordmark, primary search action, brand accents |
| `brand.accent` | `#008673` | Utility actions and some links; not every navigation link |
| `brand.success` | `#107B1E` | Savings badges, highlighted prices and delivery information |
| `background.default` | `#FFFFFF` | Header, product cards and content surfaces |
| `background.light` | `#ECEFF1` | Page canvas between modules |
| `background.dark` | `#3A4E58` | Footer wordmark strip |
| `text.primary` | `rgba(0,0,0,.87)` | Primary copy; approximately `#212121` on white |
| `text.secondary` | `rgba(0,0,0,.54)` | Supporting copy; approximately `#757575` on white |
| `text.muted` | `#767676` | Product metadata and price history |
| `text.onDark` | `#FFFFFF` | Primary button label and inverted wordmark |
| `border.subtle` | `rgba(0,0,0,.12)` | Fine neutral divisions; approximately `#E0E0E0` on white |
| `membership.smart` | `#422779` | Smart membership identity |

Preserve alpha colors when backgrounds vary. `brand.error` and `background.overlay` are `null`: their intended semantic values were not verified. Advertising colors, such as the yellow sponsored masthead, are campaign artwork rather than global brand tokens. Do not infer error colors from artwork or default browser link colors from unstyled wrapper elements.

## Typography

The homepage mixes three families. Use **Open Sans** for the search/header interface and utility navigation, **Inter** for product titles, product metadata and newer content headings, and **Roboto** for the observed footer/legacy headings. Some containers report Times New Roman, but their visible children have explicit font styles; that browser default is not a brand font.

| Role | Family | Size / line height | Weight |
| --- | --- | --- | --- |
| Header links and search input | Open Sans | 14px / 21px; input box 40px high | 400 |
| Primary action | Open Sans | 16px / 22.08px; label centered in 40px | 700 |
| Category trigger | Open Sans | 16px / 22.08px | 700 |
| Product title | Inter | 14px / 20px | 400 |
| Product metadata | Inter | 12px / 16px | 400 |
| Price examples | Inter | 22px or 24px | 400 or 700 by module |
| Section heading | Inter | 24px / 31.2px | 400 |
| Footer heading | Roboto | 21.008px / 27.3104px | 500 |

Observed CSS declarations cover Inter 300/400/500/700, Open Sans 300/400/600/700, and Roboto 300/400/500/700. Inter's file named `500` is declared as CSS weight 500 even though its local-font alias says SemiBold; retain the declared weight. Primary actions use uppercase with 2px tracking; ordinary navigation and product copy do not.

Example local declarations below assume CSS relative to the repository root. Adapt URLs to the application's public asset mapping. The original `@font-face` rules, including unicode subsets and fallback sources, are preserved in `design-source.json`.

```css
@font-face {
  font-family: "Open Sans";
  src: url("assets/fonts/open-sans/open-sans_6cc28a8e.woff2") format("woff2");
  font-style: normal;
  font-weight: 300 700;
  font-display: swap;
}
@font-face {
  font-family: "Roboto";
  src: url("assets/fonts/roboto/roboto_e4451a57.woff2") format("woff2");
  font-style: normal;
  font-weight: 300 700;
  font-display: swap;
}
@font-face {
  font-family: "Inter";
  src: url("assets/fonts/inter/inter-300_6e675dc7.woff2") format("woff2");
  font-style: normal;
  font-weight: 300;
  font-display: swap;
}
@font-face {
  font-family: "Inter";
  src: url("assets/fonts/inter/inter-400_ff6a2a72.woff2") format("woff2");
  font-style: normal;
  font-weight: 400;
  font-display: swap;
}
@font-face {
  font-family: "Inter";
  src: url("assets/fonts/inter/inter-500_16fd771f.woff2") format("woff2");
  font-style: normal;
  font-weight: 500;
  font-display: swap;
}
@font-face {
  font-family: "Inter";
  src: url("assets/fonts/inter/inter-700_460e5670.woff2") format("woff2");
  font-style: normal;
  font-weight: 700;
  font-display: swap;
}
```

## Spacing and layout

Use a 4px base unit as a practical normalization of the measured interface. The saved subset is 4, 8, 12, 16, 24, 32 and 40px; it is not a claim about an official complete scale. Small gaps and badges use 4/8px, controls use 8/16px, and content gutters and many card interiors use 24px. Section headings have a 16px bottom margin. A few components use measured exceptions, including 6px icon gaps and 14px navigation padding.

At the inspected desktop width, the content has approximately 24px outer gutters and horizontally arranged product shelves, category imagery and a larger product grid. The two-row white header is about 129px high, including borders: a 75px search row and a 53px category/navigation row. These are desktop measurements, not responsive breakpoints. No mobile layout was inspected.

## Border radius

| Token | Radius | Context |
| --- | --- | --- |
| `none` | 0px | Structural rows, text and ordinary links |
| `control` | 2px | Search action and compact controls |
| `sm` | 4px | Rare small detail; not the default card radius |
| `md` | 8px | Smaller tiles and image containers |
| `lg` | 16px | Large panels, promotional tiles and product-card outlines |
| `circle` | 100% | Circular indicators |

The search field specifically has `2px 0 0 2px` corner radii where it joins the search group. Promotional artwork may contain rounded shapes that are not CSS component radii.

## Components

**Header and navigation.** Place the original orange logo at the left of a white header, at the observed 128 × 43px size. Search occupies the central area, followed by delivery, favorites, messages, notification, basket and account controls. Use thin neutral outline icons. The lower row starts with the bold category trigger and continues with regular 14px Open Sans links. Avoid copying the browser defaults found on icon-only link wrappers.

**Primary button.** The search action is orange with white uppercase Open Sans, 16px/700 and 2px letter spacing. It is 40px high with 2px corners and no shadow. Its outer button has zero padding; the inner label supplies 16px horizontal padding. The normalized token combines these into `0px 16px`. Hover was measured as the same orange at 80% alpha, composited on the surface beneath it. Disabled and validation states were not inspected.

**Search input.** Use a 40px-high field with 8px padding, 14px Open Sans and subtle neutral outlines. The category select and orange action form one horizontal search group. The input's left corners are 2px. Keep the Polish placeholder and visible control labels when adapting the visual reference to a Polish product.

**Product cards.** Use white surfaces, fine neutral outlines and 16px rounded outer corners in the observed product shelves. Center product photography with a favorite-heart control at the upper right. Follow with price/history, membership or delivery benefits, a compact two-line title and secondary metadata. The inspected title uses Inter 14px/20px; metadata uses 12px/16px. Green indicates price benefits and delivery information. Product shelves and grid modules have different layouts, so do not force one fixed card width across both.

**Promotional surfaces.** The hero is a wide carousel with 16px corners and pagination below. Small benefit tiles form a horizontal row beneath it. Campaign imagery and the sponsored masthead change independently of the design system. Use the screenshots for composition, not as a source of fixed campaign copy or permanent promotional colors.

**Footer.** Group utility links into text columns on the pale canvas. Footer headings use Roboto 500. The lower dark slate strip carries the original white wordmark; preserve its contrast and proportions.

## Logo usage

Use `logo.svg` on white/light surfaces and `logo-inverted.svg` on the dark footer surface. Both have the original `0 0 145 50` viewBox. Keep the intrinsic proportions, preserve the original path data, and leave surrounding space comparable to the header screenshot. No official minimum-size or clear-space rule was verified; do not present the measured placement as a trademark standard. Do not reconstruct the wordmark using a text font.

## Visual style

Allegro combines an energetic orange identity with a practical, information-dense shopping interface. White cards and a cool pale-gray canvas separate many products without heavy shadows. Rounded promotional panels soften the layout while search and navigation remain compact. Product photography, price hierarchy and small benefit labels carry much of the visual communication. The interface uses different font families in different modules, so matching component roles is more faithful than imposing a single family everywhere.

## Verification and limits

The browser ran visibly throughout extraction. The initial temporary access challenge cleared through normal navigation; no challenge-page styles were used. Consent was dismissed, delayed overlays were checked, and the page was scrolled to load sections before saving the final reference. The screenshots were opened for visual inspection. Search hover and focus were exercised without submitting a query, logging in or making a purchase.

Saved JSON and asset signatures were checked locally. The viewport screenshot is 1440px wide; the full-page image is 1425px wide because it excludes the 15px scrollbar. This deliverable adds reference documentation and assets only; it does not modify the running application. Desktop homepage observations do not establish mobile behavior, complete accessibility compliance, error states or every interaction. Product content and carousel slides can differ between the full-page and viewport captures because the source site is live.

## Product adaptation for readable text

Independent application QA on 2 October 2026 measured insufficient contrast for white 16px primary-button labels on `#FF5A00` and orange 16px policy links on white. The observed reference remains unchanged. The product keeps the original logo and orange primary-action background, but uses dark `#212121` primary-button text and the existing `#008673` accent for official policy links. Font roles, button geometry, spacing and underlines remain as observed.

Enabled normal-size text must meet an unrounded contrast ratio of at least 4.5:1 in normal, hover and focus states. A logo is exempt; inactive controls are excluded. This targeted adaptation follows [WCAG 2.2 Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and does not claim complete WCAG conformance. Extracted tokens and source screenshots retain their original observed values; product adaptations must be verified against actual computed styles.

---
name: UI UX Pro Max
description: Comprehensive UI/UX design intelligence for landing pages, dashboards, and web apps. Auto-activates on any UI/UX design request.
tags: [ui, ux, design, frontend, landing-page, web]
---

# UI UX Pro Max

Comprehensive UI/UX design intelligence skill. Use when designing pages, choosing styles/colors/fonts, reviewing UX, fixing UI bugs, or improving visual quality.

**Auto-activate triggers:** "Build landing page", "Design hero section", "Choose colors", "Fix UI", "Review UX", "Add dark mode", "Create component", "What style for..."

---

## When to Apply

**Must Use:** New page, UI component, color/font/layout choice, UX review, accessibility check, navigation design.
**Skip:** Pure backend logic, API design, infrastructure, non-visual scripts.

**Rule:** If the task changes how something *looks, feels, moves, or is interacted with* → use this skill.

---

## Priority Rules (1 = most critical)

| Priority | Category | Domain | Key Checks |
|---|---|---|---|
| 1 | Accessibility | `ux` | Contrast 4.5:1, alt text, keyboard nav, aria-labels |
| 2 | Touch & Interaction | `ux` | Min 44×44px targets, 8px gap, loading feedback |
| 3 | Performance | `ux` | WebP/AVIF, lazy loading, CLS < 0.1 |
| 4 | Style Selection | `style`, `product` | Match product type, SVG icons (no emoji) |
| 5 | Layout & Responsive | `ux` | Mobile-first, no horizontal scroll, viewport meta |
| 6 | Typography & Color | `typography`, `color` | Base 16px, line-height 1.5, semantic tokens |
| 7 | Animation | `ux` | 150–300ms, transform/opacity only, reduced-motion |
| 8 | Forms & Feedback | `ux` | Visible labels, error near field, loading states |
| 9 | Navigation | `ux` | Predictable back, bottom nav ≤5, deep linking |
| 10 | Charts & Data | `chart` | Legends, tooltips, accessible colors |

---

## Workflow

### Step 1 — Analyze Requirements
Extract: product type, audience, style keywords, tech stack (Next.js/React for this project).

### Step 2 — Generate Design System (REQUIRED for new pages)

```bash
python3 skills/ui-ux-pro-max/scripts/search.py "fitness store ecommerce landing page" --design-system -p "FitnessStore"
```

### Step 2b — Persist for multi-page consistency

```bash
python3 skills/ui-ux-pro-max/scripts/search.py "fitness ecommerce" --design-system --persist -p "FitnessStore"
# Creates: design-system/MASTER.md + design-system/pages/<page>.md
```

**Hierarchical retrieval pattern:**
```
I am building the [Page] page.
Read design-system/MASTER.md.
Check if design-system/pages/[page].md exists — if yes, its rules override Master.
Generate the code...
```

### Step 3 — Domain Deep-Dives (as needed)

```bash
python3 skills/ui-ux-pro-max/scripts/search.py "fitness activewear" --domain product
python3 skills/ui-ux-pro-max/scripts/search.py "energetic vibrant" --domain style
python3 skills/ui-ux-pro-max/scripts/search.py "fitness health" --domain color
python3 skills/ui-ux-pro-max/scripts/search.py "bold modern" --domain typography
python3 skills/ui-ux-pro-max/scripts/search.py "hero social-proof cta" --domain landing
python3 skills/ui-ux-pro-max/scripts/search.py "animation accessibility" --domain ux
```

### Step 4 — Stack Guidelines

```bash
python3 skills/ui-ux-pro-max/scripts/search.py "performance bundle" --stack nextjs
```

---

## Landing Page Patterns (`--domain landing`)

Key structures for high-converting landing pages:

- **Hero:** Value prop headline + subheadline + single CTA above fold
- **Social proof:** Logos / testimonials / numbers (early, before features)
- **Features:** 3–6 benefits with icons, benefit-focused (not feature-focused)
- **Pricing:** Max 3 tiers, highlight recommended, clear CTA per tier
- **FAQ:** Addresses objections, improves SEO
- **Final CTA:** Repeat primary CTA with urgency/benefit reminder

**Fitness store specific:**
- Show product visuals prominently (activewear is visual-first)
- Use energy/motion in design (reflects the fitness lifestyle)
- Trust signals: product quality, returns policy, real customer photos
- Mobile-first (fitness audience skews mobile)

---

## Design Recommendations for Fitness/Activewear E-commerce

**Style:** Bold minimalism or energetic dark-mode
**Colors:**
- Option A (Energy): Deep black `#0A0A0A` + Electric orange `#FF4D00` + White `#FFFFFF`
- Option B (Premium): Navy `#1A1F36` + Gold `#D4AF37` + Light `#F8F9FA`
- Option C (Fresh): Forest green `#2D5016` + Lime `#8BC34A` + White

**Typography:**
- Heading: `Space Grotesk` or `Barlow Condensed` (bold, sporty)
- Body: `Inter` or `DM Sans` (clean, readable)

**Effects:** Subtle grain texture on hero, sharp shadows (not soft), high-contrast CTAs

---

## Common Rules (Professional UI)

### Icons
- Use vector icons only (Heroicons, Lucide, Phosphor) — never emoji as icons
- Consistent icon style (all outline OR all filled, same stroke weight)
- Min 44×44px touch target

### Interaction
- Tap feedback within 80–150ms
- Animations 150–300ms with ease-out enter / ease-in exit
- Disabled states: reduced opacity (0.38–0.5) + semantic attribute

### Light/Dark Mode
- Primary text contrast ≥4.5:1 in both modes
- Never invert colors for dark mode — use desaturated/tonal variants
- Token-driven theming (no hardcoded hex in components)

### Layout
- Safe areas respected (notch, gesture bar)
- 4/8px spacing rhythm throughout
- Mobile-first, verified at 375px and landscape

---

## Pre-Delivery Checklist

**Visual Quality**
- [ ] No emojis used as icons
- [ ] Consistent icon family and stroke weight
- [ ] Semantic color tokens (no raw hex in components)
- [ ] Pressed states don't shift layout

**Interaction**
- [ ] Touch targets ≥44×44px
- [ ] Micro-interactions 150–300ms
- [ ] Loading/disabled states implemented
- [ ] Screen reader labels on interactive elements

**Layout**
- [ ] Tested at 375px (small phone)
- [ ] No horizontal scroll
- [ ] Fixed elements don't cover content
- [ ] Safe areas respected

**Accessibility**
- [ ] Contrast ≥4.5:1 for text
- [ ] Color is not the only indicator
- [ ] Reduced-motion supported
- [ ] Keyboard navigation works

---

## Install Python Scripts (Required for CLI Search)

```bash
cd web
npm install -g uipro-cli
uipro init --ai claude
```

This installs the full search engine with 67 styles, 161 color palettes, 57 font pairings, 99 UX guidelines, and 25 chart patterns.

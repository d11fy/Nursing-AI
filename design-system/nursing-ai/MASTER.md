# Design System Master File

> **LOGIC:** When building a specific page, first check `design-system/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** Nursing AI
**Updated:** 2026-10-01
**Category:** Healthcare App
**Design Dials:** Variance 4/10 (Balanced / Modern) | Motion 2/10 (Subtle) | Density 5/10 (Standard)

---

## Global Rules

### Color Palette

| Role | Hex | CSS Variable |
|------|-----|--------------|
| Primary | `#0F5D75` | `--color-primary` |
| On Primary | `#FFFFFF` | `--color-on-primary` |
| Secondary | `#0891B2` | `--color-secondary` |
| Accent/CTA | `#078861` | `--color-accent` |
| Background | `#F6FAFC` | `--color-background` |
| Foreground | `#102A3A` | `--color-foreground` |
| Muted | `#EDF4F6` | `--color-muted` |
| Border | `#D9E7EC` | `--color-border` |
| Destructive | `#DC2626` | `--color-destructive` |
| Ring | `#0E7490` | `--color-ring` |

**Color Notes:** Deep medical blue for trust, calm cyan for study context, and health green only for positive states. White remains the dominant surface. Values were adjusted from the generated healthcare palette to meet the product request and improve contrast.

### Typography

- **Heading Font:** Cairo 700–900
- **Body Font:** Cairo 400–600
- **Mood:** medical, clean, accessible, professional, Arabic-first, trustworthy
- **Loading:** `next/font/google`, self-hosted by Next.js with `font-display: swap`

**CSS Import:**
```tsx
const cairo = Cairo({ variable: "--font-sans", subsets: ["arabic", "latin"] });
```

### Spacing Variables

*Density: 5/10 — Standard*

| Token | Value | Usage |
|-------|-------|-------|
| `--space-xs` | `4px` / `0.25rem` | Tight gaps |
| `--space-sm` | `8px` / `0.5rem` | Icon gaps, inline spacing |
| `--space-md` | `16px` / `1rem` | Standard padding |
| `--space-lg` | `24px` / `1.5rem` | Section padding |
| `--space-xl` | `32px` / `2rem` | Large gaps |
| `--space-2xl` | `48px` / `3rem` | Section margins |
| `--space-3xl` | `64px` / `4rem` | Hero padding |

### Shadow Depths

| Level | Value | Usage |
|-------|-------|-------|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | Subtle lift |
| `--shadow-md` | `0 4px 6px rgba(0,0,0,0.1)` | Cards, buttons |
| `--shadow-lg` | `0 10px 15px rgba(0,0,0,0.1)` | Modals, dropdowns |
| `--shadow-xl` | `0 20px 25px rgba(0,0,0,0.15)` | Hero images, featured cards |

---

## Component Specs

### Buttons

```css
/* Primary Button */
.btn-primary {
  background: #0F5D75;
  color: white;
  padding: 12px 24px;
  border-radius: 12px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}

.btn-primary:hover {
  opacity: 0.9;
  transform: translateY(-1px);
}

/* Secondary Button */
.btn-secondary {
  background: transparent;
  color: #0F5D75;
  border: 1px solid #D9E7EC;
  padding: 12px 24px;
  border-radius: 12px;
  font-weight: 600;
  transition: all 200ms ease;
  cursor: pointer;
}
```

### Cards

```css
.card {
  background: #FFFFFF;
  border: 1px solid #D9E7EC;
  border-radius: 16px;
  padding: 24px;
  box-shadow: 0 2px 12px rgba(16, 42, 58, 0.035);
  transition: all 200ms ease;
  cursor: pointer;
}

.card:hover {
  border-color: color-mix(in srgb, #0F5D75 32%, #D9E7EC);
  box-shadow: 0 12px 32px rgba(15, 93, 117, 0.08);
}
```

### Inputs

```css
.input {
  padding: 12px 16px;
  border: 1px solid #E2E8F0;
  border-radius: 12px;
  font-size: 16px;
  transition: border-color 200ms ease;
}

.input:focus {
  border-color: #0E7490;
  outline: none;
  box-shadow: 0 0 0 3px #0E749020;
}
```

### Modals

```css
.modal-overlay {
  background: rgba(0, 0, 0, 0.5);
  backdrop-filter: blur(4px);
}

.modal {
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: var(--shadow-xl);
  max-width: 500px;
  width: 90%;
}
```

---

## Style Guidelines

**Style:** Accessible Medical Education SaaS

**Keywords:** professional, medical, academic, calm, trustworthy, clean, Arabic-first, low cognitive load, structured reading

**Best For:** Nursing education, AI tutoring, long-form study, student dashboards, academic administration

**Key Effects:** Predominantly white surfaces, quiet blue tint on the canvas, 16px cards, soft blue-gray borders, restrained elevation, visible cyan focus rings, semantic status colors, no layout-shifting hover, 150–300ms transitions, and sticky/safe-area aware chat controls.

### Page Pattern

**Pattern Name:** AI-Driven Dynamic Landing

- **Conversion Strategy:** Immediate value demonstration. 'Show, don't tell'. Low friction start.
- **CTA Placement:** Input Field (Hero) + 'Try it' Buttons
- **Section Order:** 1. Prompt/Input Hero, 2. Generated Result Preview, 3. How it Works, 4. Value Prop

---

## Motion

**Stagger List** (Subtle) — Trigger: load or scroll | Duration: 250-350ms | Easing: `power1.out`

```js
gsap.from('.list-item', { opacity: 0, y: 8, duration: 0.3, stagger: 0.03 });
```

**Framework notes:** Select items with a stable class/data-attribute (not array index) so re-renders in React don't break targeting

- ✅ Keep per-item stagger delay small (0.02-0.04s) for lists longer than 10 items
- ❌ Don't stagger by more than 0.1s per item on long lists; total reveal time becomes sluggish
- ⚡ For virtualized lists, only animate items currently mounted in the DOM

---

## Anti-Patterns (Do NOT Use)

- ❌ Bright neon colors
- ❌ Motion-heavy animations
- ❌ AI purple/pink gradients

### Additional Forbidden Patterns

- ❌ **Emojis as icons** — Use SVG icons (Heroicons, Lucide, Simple Icons)
- ❌ **Missing cursor:pointer** — All clickable elements must have cursor:pointer
- ❌ **Layout-shifting hovers** — Avoid scale transforms that shift layout
- ❌ **Low contrast text** — Maintain 4.5:1 minimum contrast ratio
- ❌ **Instant state changes** — Always use transitions (150-300ms)
- ❌ **Invisible focus states** — Focus states must be visible for a11y

---

## Pre-Delivery Checklist

Before delivering any UI code, verify:

- [ ] No emojis used as icons (use SVG instead)
- [ ] All icons from consistent icon set (Heroicons/Lucide)
- [ ] `cursor-pointer` on all clickable elements
- [ ] Hover states with smooth transitions (150-300ms)
- [ ] Light mode: text contrast 4.5:1 minimum
- [ ] Focus states visible for keyboard navigation
- [ ] `prefers-reduced-motion` respected
- [ ] Responsive: 375px, 768px, 1024px, 1440px
- [ ] No content hidden behind fixed navbars
- [ ] No horizontal scroll on mobile

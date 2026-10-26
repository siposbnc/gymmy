# Gymmy — design system

Visual foundations and component previews for Gymmy, published to Claude Design.
Every file here is a self-contained HTML page that renders as a card in the Design
System pane.

## Direction

**Precision instrument, not neon dashboard.**

Fitness apps default to neon-on-blue-black and end up looking like crypto tickers.
Gymmy goes the other way: warm charcoal and paper neutrals, one molten orange
accent, and an editorial serif for headers set against brutal tabular numerals.
The register is *focused and earned* — a well-made logbook, not a hype machine.

Three decisions carry the whole thing:

1. **Warm neutrals.** Dark mode is a warm near-black (`#14110F`), not blue-black.
   Light mode is paper (`#F6F3EE`), not white. Cold greys read clinical; this
   reads physical.

2. **Numerals are the hero.** Weight and reps are the entire point of the app, so
   they get the largest type, tabular figures so they don't jitter as they change,
   and a slight width increase for presence. Labels shrink to make room.

3. **The status rail.** Each set row carries a thin vertical bar on its left edge:
   hollow when pending, emerald when logged, gold on a personal record. Glance
   down the column and you know how much of the session is done without reading a
   single number. This is the one detail that makes Gymmy recognisable.

## Type

| Role | Face | Why |
| --- | --- | --- |
| UI + all numerals | **Archivo** (variable) | Real tabular figures, and a width axis that gives hero weights presence without a second font |
| Headers, empty states | **Instrument Serif** | The unexpected move — an editorial voice in a training log. Used sparingly, never on data |

Deliberately *not* Inter, Roboto, system-ui, or Space Grotesk.

Previews load both from Google Fonts with fallback stacks. The app will self-host
via `@fontsource` so it works offline — a PWA used in a gym basement cannot depend
on a font CDN.

## Files

```
tokens.css                      canonical tokens — the source of truth
foundations/color.html           palette, both themes, with contrast ratios
foundations/typography.html      scale, numeral treatment, the serif's role
foundations/spacing-elevation.html   spacing ramp, radii, shadows, touch targets
foundations/motion.html          durations, easings, the set-complete sequence
components/buttons.html          variants, sizes, states, touch minimums
components/set-row.html          the core component, every state
components/numeric-input.html    stepper + the custom numeric pad
components/rest-timer.html       the sticky rail, plus why it survives sleep
components/explainer-sheet.html  the four-part "how this is worked out" sheet
components/data-display.html     stat tiles, PR board, estimate-vs-record, ghost line
screens/active-session.html      the full screen, light and dark
```

Charts are deliberately absent. They belong to the Progress screen (milestone M4)
and want the `dataviz` guidance applied properly rather than a sparkline bolted
on here.

## Conventions

- **Tokens only.** No component names a raw colour. If a value is needed that
  isn't in `tokens.css`, the token is missing — add it there first.
- **Both themes always.** Every preview shows light and dark side by side. A
  component that only works in one is not finished.
- **Previews inline their tokens.** Each file carries a copy of the `:root` and
  `[data-theme="dark"]` blocks so it renders standalone. `tokens.css` remains the
  source of truth; change it there and regenerate.
- **44px minimum touch targets**, primary actions in the bottom third of the
  screen. The design brief is "one sweaty hand, mid-set, heart rate up."
- **Motion respects `prefers-reduced-motion`** — the tokens collapse to 1ms
  rather than each component handling it.

# GrassRoots Design System

## Direction

A parent checks the app one-handed beside a wet pitch at 07:15, in flat daylight, needing the next action to be unmistakable before the school-run clock moves again. The product uses a bright, high-contrast light theme with restrained colour and strong status hierarchy. The identity is community-minded rather than nostalgic or aggressively sporty.

## Colour

Use OKLCH tokens throughout. The seed hue is 188° and the strategy is restrained: teal identifies primary actions and active navigation; amber signals time-sensitive attention; surfaces stay neutral and readable.

```css
--background: oklch(1 0 0);
--surface: oklch(0.975 0.004 188);
--surface-strong: oklch(0.94 0.008 188);
--ink: oklch(0.20 0.025 210);
--muted: oklch(0.46 0.025 210);
--primary: oklch(0.56 0.12 188);
--primary-strong: oklch(0.45 0.13 188);
--accent: oklch(0.72 0.14 72);
--success: oklch(0.58 0.13 145);
--warning: oklch(0.72 0.14 72);
--danger: oklch(0.56 0.17 28);
--info: oklch(0.58 0.11 245);
```

Saturated primary fills use near-white text. Statuses always pair colour with an icon or label. Body text contrast targets at least 7:1 against the background.

## Typography

Use Geist Sans for the application and public site. Product headings use a fixed, compact scale; public marketing headings may use a restrained responsive scale capped below 6rem. Keep display tracking no tighter than -0.04em, balance headings, and limit prose to 65–75 characters per line.

## Shape and Elevation

Use 10–16px radii for cards and panels, 8–12px for controls, and pills only for compact statuses or filters. Prefer borders or a small defined shadow, never both as decoration. The glowing effect is reserved for the public hero showcase and a small number of high-value interactive previews.

## Layout

Parents use a five-destination mobile navigation: Home, Schedule, Messages, Payments, Family. Coaches use Today, Schedule, Team, Coaching, More. Club administration uses a collapsible sidebar and task-focused work area. Mobile defaults to agendas and stacked actions; desktop earns denser calendars, planners, and tables.

## Components and States

All interactive components include default, hover, focus, active, disabled, loading, and error states. Loading uses skeletons matched to content. Empty states explain the next useful action. Permission-denied states identify the missing capability without exposing sensitive data.

## Motion

Use 150–250ms ease-out transitions for state changes. The container-scroll animation appears only on the public product showcase. Pointer glows remain decorative and never gate information. Respect `prefers-reduced-motion` and provide stable, already-visible content before animation.

## Content

Use direct British English: “Can Jayden attend?”, “You need to respond by Thursday”, and “Training has moved to Pitch 2”. Surface changed values explicitly. Never use database terminology, competitive child rankings, or vague icon-only actions.

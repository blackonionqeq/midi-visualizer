# iPad Landscape Viewport Compatibility Design

## Goal

Keep the title, playback controls, measure minimap, falling-note canvas, and
piano keyboard visible within one iPad Safari viewport in landscape
orientation. The document itself must not scroll during normal use.

## Problem

The application shell currently uses `height: 100vh`. On iPad Safari, `vh`
tracks the large viewport and can be taller than the area visible while browser
toolbars are shown. The canvas therefore extends below the visible viewport.
Scrolling reveals the keyboard but moves the controls and title off-screen.

The multi-row header can also consume extra height on shorter landscape
viewports, reducing the space available to the visualization.

## Design

Treat the application as a fixed, single-screen instrument:

- Give `html`, `body`, and `#app` an explicit full height and disable document
  scrolling.
- Keep `100vh` as a compatibility fallback, then override the application shell
  with `height: 100dvh` so it follows Safari's currently visible viewport.
- Prevent the header and the 30-pixel minimap from shrinking.
- Let `.viz-area` consume only the remaining height with `flex: 1 1 auto` and
  `min-height: 0`.
- Add a landscape, short-viewport media query that reduces only header padding
  and row spacing. All controls and status information remain available.

No JavaScript viewport measurement is needed. The audio transport, MIDI state,
canvas timing, and keyboard dimensions remain unchanged.

## Compatibility and Fallback

Browsers that support dynamic viewport units use `100dvh`. Older browsers
ignore that declaration and retain the preceding `100vh` fallback. The layout
remains usable on desktop and portrait screens, although landscape iPad is the
primary target.

## Verification

Run `pnpm check`, then manually verify:

1. iPad landscape with Safari toolbars visible: no vertical page scrolling and
   the full keyboard is visible.
2. Toolbars expanding or collapsing: the visualization resizes to the visible
   viewport without losing the controls or keyboard.
3. Desktop viewport: controls, minimap, and visualization retain their current
   behavior.
4. A short landscape viewport: compact spacing activates without hiding or
   overlapping controls.
5. File selection, playback, seeking, speed, volume, and minimap dragging still
   work as before.

## Out of Scope

- A separate fullscreen or performance mode.
- Sticky controls within a scrolling document.
- Changes to piano keyboard height, audio scheduling, or MIDI rendering.

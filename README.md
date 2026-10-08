# accordion

A small, accessible accordion with no dependencies, built on the browser's native `<details>` and `<summary>`.
It works before the script loads, and the script adds animation, keyboard navigation, one-at-a-time mode, deep links and an event API.

**3.4 kB gzipped** (JS + CSS) · **0 dependencies** · **MIT**

Open `index.html` for a live demo and full reference.

## Use it

Copy `accordion.js` and `accordion.css` into your project.

```html
<link rel="stylesheet" href="accordion.css">
<script src="accordion.js" defer></script>

<accordion-group>
  <details id="shipping" name="faq">
    <summary>How long does shipping take?</summary>
    <div>Three to five working days.</div>
  </details>
  <details id="returns" name="faq">
    <summary>Can I return an order?</summary>
    <div>Yes, within 30 days.</div>
  </details>
</accordion-group>
```

The `name` attribute is optional. It keeps the group one-at-a-time before the script has loaded.

## Features

- **Accessible by default.** A `<summary>` is announced as a button with its expanded state, kept in sync by the browser.
- **Keyboard.** <kbd>Enter</kbd>/<kbd>Space</kbd> toggle; <kbd>↑</kbd> <kbd>↓</kbd> <kbd>Home</kbd> <kbd>End</kbd> move between headers (WAI-ARIA Authoring Practices pattern).
- **Interruptible animation.** Real heights via the Web Animations API. A second click reverses from mid-flight. Turned off under `prefers-reduced-motion`.
- **Progressive enhancement.** Without JavaScript every item still works, and find-in-page opens matching sections in Chromium.
- **Deep links.** `#item-id` in the URL opens that item.
- **Nesting and dynamic content.** Nested groups stay independent; items added later are picked up.

## API

| Attribute | Effect |
| --- | --- |
| `multiple` | Lets several items stay open. Without it, opening one closes the others. |
| `duration` | Fixed animation length in ms. By default it scales with the panel's height. |

| Method / property | Effect |
| --- | --- |
| `open(item)` / `close(item)` | `item` is the `<details>` element, its index, or its id. |
| `toggle(item, force?)` | Flips an item, or sets it when `force` is given. |
| `openAll()` / `closeAll()` | Every item. `openAll` ignores one-at-a-time mode. |
| `isOpen(item)` | Where the item is heading, counting animations in progress. |
| `items` | The group's `<details>` elements (nested groups excluded). |
| `multiple` | Reflects the attribute. |

**Event:** `accordion-toggle` bubbles from the group when an item starts to open or close, with `event.detail = { item, open, index }`.

**Styling:** override `--accordion-border`, `--accordion-hover`, `--accordion-accent`, `--accordion-padding-block` and `--accordion-padding-inline`. Each item carries `data-state="open" | "closed"`, which flips the moment a close begins.

## Develop

```sh
npm install
npm test     # browser tests via Playwright + node:test
npm start    # serve the demo locally
```

## History

First hand-coded in 2018. Rewritten in 2026 as a web component. The original looked panels up with `getElementsByClassName(".accordion-panel")`; the leading dot meant it never found them, so the panels never opened.

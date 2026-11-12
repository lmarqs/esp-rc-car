---
description: Sets where code goes in site/, how logic stays off the page, that no UI framework is used, how colours and styles are named and where the code is tested.
audience: Whoever writes or reviews an .astro, .ts or .css file or a test in site/; knows Astro, TypeScript and CSS
---
# Website sources

Every `.astro`, `.ts` and `.css` file in `site/` follows the rules below, and so does every test of the site. No
check enforces them. How a page behaves for the visitor is in [Website UX](website-ux.md), and how the site's parts
depend on each other is in the [Website section of the architecture](../architecture.md#website).

A MUST does not vary. A SHOULD yields only to a reason written beside the code.

- A file MUST go where its kind lives: a page in `site/src/pages/`, a page's text in `site/src/content/` as one
  Markdown file per project or topic, a component in `site/src/components/`, and logic in `site/src/lib/`. A feature
  with several files, such as flashing, is a slice: its components share a folder of their own,
  `site/src/components/flash/`, and its logic a folder of its own, `site/src/lib/flash/`. The rest of the site
  imports a slice only through its component and the readers it names, so a page that flashes imports `FlashCard`
  and `readManifest`, never the session or the flasher. The slice can then change inside without touching a page.
- Logic with rules of its own, such as a state machine, a parser or a validator, MUST be a module in `site/src/lib/`
  that does not touch the DOM: no `document`, no element, no event. The component reads the page's events, calls
  the module and writes the result back. Vitest runs in Node with no browser, so a module that reads the DOM cannot
  be unit-tested. Two modules reach a browser global, and their unit tests stub it: `lib/flash/flasher.ts` for Web
  Serial and `fetch`, and `lib/flash/createFlasher.ts` for the test's fake on `window`. What a slice's component
  shows for each state of its logic, `components/flash/view.ts`, is a function of that state with no DOM, so it sits
  beside its component and has a unit test too. A component that only animates its own markup, as each in
  `site/src/components/examples/` does, keeps that script in the component.
- The site MUST NOT use a UI framework. Its dependencies are Astro, which builds every page, and `esptool-js`,
  which flashes; Vitest and Playwright test it. A component is an Astro component, and what runs in the browser is
  plain TypeScript in the component's `<script>` tag. Astro renders a component to HTML at build time and ships
  only its `<script>`, so no page carries a framework's runtime.
- A component MUST take its colours, fonts, radius and stroke from the tokens in `site/src/styles/global.css`: `--ink`
  and `--muted` for text, `--yellow`, `--blue`, `--coral` and `--green` with their `--tint-*` fills, `--line`,
  `--radius`, `--stroke`, `--mono` and `--sans`. New code MUST NOT write a literal colour; a new colour becomes a
  token first. Rule 3 of [Website UX](website-ux.md), one meaning per colour, holds only when each meaning has one
  name, and a hex value pasted into a component has none. In SVG, a class such as `.ink` and `.thin` in
  `global.css` carries the stroke. The illustrations in `Art.astro`, `Logo.astro` and `examples/` predate this rule:
  they write 173 literal hex colours on 140 lines of the 8 files in `site/src/components/`, and this rule
  leaves them as they are.
- A style that only one component or page uses MUST be in that file's `<style>`, which Astro scopes to the file's
  own elements, so a class name there cannot restyle another component. `global.css` holds the tokens, the defaults
  for elements such as `body`, `pre` and `table`, and the classes that several pages share, such as `.btn`,
  `.card`, `.grid` and `.notice`. No file uses `is:global`.
- A test of `site/src/lib/` and of a slice's view function MUST be a Vitest file in `site/tests/unit/`, named
  `*.test.ts`, and run with `mise run site:test`. What a visitor sees and does MUST be a Playwright file in
  `site/tests/e2e/`, named `*.spec.ts`, which builds the site into `site/dist-e2e` with a fixture manifest and drives
  Chromium. A unit test is fast and pinpoints a rule, and an end-to-end test shows that the pieces are wired to the
  page.

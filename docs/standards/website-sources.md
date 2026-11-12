---
description: Sets where code goes in site/, how logic stays off the page, that no UI framework is used, how colours and styles are named and where the code is tested.
audience: Whoever writes or reviews an .astro, .ts or .css file or a test in site/; knows Astro, TypeScript and CSS
---
# Website sources

Every `.astro`, `.ts` and `.css` file in `site/src/` follows the rules below, and so does every test of the site. No
check enforces them. How a page behaves for the visitor is in [Website UX](website-ux.md), and how the site's parts
depend on each other is in the [Website section of the architecture](../architecture.md#website).

A MUST does not vary. A SHOULD yields only to a reason written beside the code.

- A file MUST go where its kind lives: a page in `site/src/pages/`, a page's text in `site/src/content/` as one
  Markdown file per project or topic, a layout in `site/src/layouts/`, a component in `site/src/components/`, a
  stylesheet in `site/src/styles/` and logic in `site/src/lib/`. A feature with several files is a slice, with a
  folder of its own in `components/` and in `lib/`. The rest of the site imports a slice only through its component
  and the readers it names, so the slice can change inside without touching a page.
- Logic with rules of its own, such as a state machine, a parser or a validator, MUST be a module in `site/src/lib/`
  that does not touch the DOM: no `document`, no element, no event. The component reads the page's events, calls
  the module and writes the result back. Vitest runs in Node with no browser, so a module that reads the DOM cannot
  be unit-tested. A module that reaches a browser global, such as `navigator` or `window`, is unit-tested with that
  global stubbed. What a component shows for each state of its logic MAY be a DOM-free function beside the
  component, which has a unit test too. A script that only animates its own component's markup stays in the
  component.
- The site's TypeScript, in `.astro` files, `src/` and `tests/`, MUST pass `astro check`, which `site:build` runs before it
  builds.
- The site MUST NOT use a UI framework. Its dependencies are Astro, which builds every page, and libraries such as
  `esptool-js`, which flashes; Vitest, Playwright and type packages test and check it. A component is an Astro
  component, and what runs in the browser is plain TypeScript in the component's `<script>` tag. Astro renders a
  component to HTML at build time and ships only its `<script>`, so no page carries a framework's runtime.
- A component MUST take its colours, fonts, radius and stroke from the tokens in `:root` of
  `site/src/styles/global.css`. The tokens come in groups, and the file is the list: surfaces (`--paper`, `--card`,
  `--chrome*`); text (`--ink`, `--muted`, `--faint`, `--quiet*`); lines (`--line`, `--edge`); the four accents
  (`--yellow`, `--blue`, `--coral`, `--green`) with their `--tint-*` and `--wash-*` fills and their `-text`, `-strong`,
  `-hover` and `-halo` variants; what sits on the dark `--ink` surface (`--on-ink*`, `--ink-raised`); code highlighting
  (`--syntax-*`); the LED (`--led-off`); and `--radius`, `--stroke`, `--mono` and `--sans`. New code MUST NOT write a
  literal colour; a new colour becomes a token first, in the group that names its meaning. Rule 3 of
  [Website UX](website-ux.md), one meaning per colour, holds only when each meaning has one name, and a hex value
  pasted into a component has none. In SVG, a class such as `.ink` and `.thin` in `global.css` carries the stroke.
  Some illustrations and styles written earlier still contain literal colours, which this rule leaves as they are.
- A style that only one component or page uses MUST be in that file's `<style>`, which Astro scopes to the file's
  own elements, so a class name there cannot restyle another component. `global.css` holds the tokens, the defaults
  for elements such as `body`, `pre` and `table`, and the classes that several pages share, such as `.btn`,
  `.card`, `.grid` and `.notice`. No file uses `is:global`.
- A test of a module in `site/src/lib/`, or of a DOM-free function beside a component, MUST be a unit test in
  `site/tests/unit/`. What a visitor sees and does MUST be an end-to-end test in `site/tests/e2e/`, which drives a
  production build in a browser against a fixture manifest. A unit test is fast and pinpoints a rule, and an
  end-to-end test shows that the pieces are wired to the page. `mise run site:test` builds the site and runs both
  kinds.

# Serving the website in English and Brazilian Portuguese

The website in `site/` is English only. This page records what Astro 7 offers for a second language, how each option
behaves under this site's `base: '/robomania'` and `trailingSlash: 'always'`, what would change in this repository,
and what three workable layouts cost.

**Recommendation:** layout 1 below. English keeps its URLs, Portuguese lives under `/robomania/pt-br/`, each route has
one page file under `src/pages/[...lang]/`, content sits in a folder per language, and a missing translation is
filled per entry in `getStaticPaths()`. Astro's own `i18n.fallback` does not fit this site: its redirect drops the
board's serial port, and neither of its types fills a single missing entry of a dynamic route (section 2.3).

## Sources

| Short name | What | Version read |
| --- | --- | --- |
| docs | Astro's documentation, `docs.astro.build/en/…`, read as the `.mdx` sources on `withastro/docs` `main` | fetched 2026-11-14; the live page footer and the docs' own `package.json` name Astro v7.4.2 |
| astro 7.4.6 | The installed package, `site/node_modules/astro` | `7.4.6`, the version `site/package.json` pins |
| built | Scratch projects built with astro 7.4.6 under `site: 'https://example.github.io'`, `base: '/robomania'`, `trailingSlash: 'always'`, `locales: ['en', 'pt-br']`, `defaultLocale: 'en'` | built 2026-11-14, outside the repository |
| here | This repository | commit `fd53309` |
| google | Google Search Central, "Tell Google about localized versions of your page" | fetched 2026-11-14 through a summarising fetch tool |
| paraglide | `https://paraglidejs.com/astro` | fetched 2026-11-14 through a summarising fetch tool |

How far each claim is checked:

- **docs** means the sentence is in Astro's documentation for the installed major version; the URL follows.
- **built** means a build with astro 7.4.6 produced it. The scratch layout had no `<ClientRouter />`: the component
  did not compile through the symlinked `node_modules` of the scratch project.
- **source** means it was read in `site/node_modules/astro/dist/`.
- **Not verified** marks what none of the three covers. Section 7 lists all of it.

Nothing was run in a browser, and nothing in this repository was built or changed.

## 1. Astro's i18n routing

### 1.1 Configuration

| Option | Type, default | What it does | Source |
| --- | --- | --- | --- |
| `i18n.locales` | `Locales`, required | Every supported language. A string such as `'pt-br'` is both the folder name and the URL segment; `{ path, codes }` maps several codes to one URL segment. Folder names must match exactly. | docs: <https://docs.astro.build/en/reference/configuration-reference/#i18nlocales> |
| `i18n.defaultLocale` | `string`, required | One of `locales`. Astro suggests lower case with hyphens, such as `pt-br`. | docs: <https://docs.astro.build/en/reference/configuration-reference/#i18ndefaultlocale> |
| `i18n.routing.prefixDefaultLocale` | `boolean`, `false` | `false`: the default language has no prefix and its pages sit at the root of `src/pages/`. `true`: every language has a prefix and a folder, and `src/pages/index.astro` is still required. | docs: <https://docs.astro.build/en/guides/internationalization/#prefixdefaultlocale> |
| `i18n.routing.redirectToDefaultLocale` | `boolean`, `false` | With `prefixDefaultLocale: true`, redirects the home URL to `/[defaultLocale]/`. | docs: <https://docs.astro.build/en/reference/configuration-reference/#i18nroutingredirecttodefaultlocale> |
| `i18n.fallback` | `Record<string, string>` | Per language, the language to show when a page does not exist. With none, a missing page is a 404. | docs: <https://docs.astro.build/en/reference/configuration-reference/#i18nfallback> |
| `i18n.routing.fallbackType` | `'redirect' \| 'rewrite'`, `'redirect'` | `redirect` sends the visitor to the fallback URL; `rewrite` renders the fallback page's content at the requested URL. | docs: <https://docs.astro.build/en/reference/configuration-reference/#i18nroutingfallbacktype> |
| `i18n.routing: 'manual'` | | Turns Astro's i18n middleware off; the project writes its own in `src/middleware`. | docs: <https://docs.astro.build/en/guides/internationalization/#manual> |
| `i18n.domains` | | A domain per language. Needs `output: 'server'` with no prerendered page, so it is out of reach for a static GitHub Pages site. | docs: <https://docs.astro.build/en/guides/internationalization/#domains> |

`Astro.currentLocale` is available on static pages and is computed from the URL; a URL with no locale prefix gives
`defaultLocale`. `Astro.preferredLocale` and `Astro.preferredLocaleList` read the `Accept-Language` header and exist
only on pages rendered on demand, so this static site cannot pick a language on the server
(docs: <https://docs.astro.build/en/guides/internationalization/#browser-language-detection>,
<https://docs.astro.build/en/reference/api-reference/#preferredlocale>).

### 1.2 `astro:i18n` helpers

Docs for all of them: <https://docs.astro.build/en/reference/modules/astro-i18n/>.

| Helper | Use on this site |
| --- | --- |
| `getRelativeLocaleUrl(locale, path?, options?)` | A link to a page in a language. Throws for an unknown locale. |
| `getAbsoluteLocaleUrl(locale, path?, options?)` | The same with `site` in front: what `hreflang` and canonical links need. |
| `getRelativeLocaleUrlList(path?)`, `getAbsoluteLocaleUrlList(path?)` | One URL per language, in `locales` order. |
| `getPathByLocale(code)`, `getLocaleByPath(path)` | Translate between a code and a custom `path`; needed only with `{ path, codes }` locales. |
| `pathHasLocale(path)`, `normalizeTheLocale(locale)`, `toCodes(locales)`, `toPaths(locales)` | Checks and conversions. `toCodes` and `toPaths` take `i18n.locales` from `astro:config/client`. |
| `redirectToDefaultLocale`, `redirectToFallback`, `notFound`, `middleware`, `requestHasLocale` | Only with `routing: 'manual'`, in a middleware. A static build has no request to run them on. |

### 1.3 How the helpers treat `base` and `trailingSlash`

The docs only say to "take into account" `base`, `trailingSlash`, `build.format` and `site` when using the helpers
(<https://docs.astro.build/en/reference/modules/astro-i18n/>); they show no output with a base. Built with this
site's settings and `prefixDefaultLocale: false`:

| Call | Result (built) |
| --- | --- |
| `getRelativeLocaleUrl('en', 'projects')` | `/robomania/projects/` |
| `getRelativeLocaleUrl('pt-br', 'projects')` | `/robomania/pt-br/projects/` |
| `getRelativeLocaleUrl('pt-br', '/projects/')` | `/robomania/pt-br/projects/` |
| `getRelativeLocaleUrl('pt-br')`, `getRelativeLocaleUrl('pt-br', '')` | `/robomania/pt-br/` |
| `getRelativeLocaleUrl('en', '')` | `/robomania/` |
| `getAbsoluteLocaleUrl('pt-br', 'projects/blink')` | `https://example.github.io/robomania/pt-br/projects/blink/` |
| `getAbsoluteLocaleUrl('en', 'projects/blink')` | `https://example.github.io/robomania/projects/blink/` |
| `getRelativeLocaleUrlList('projects')` | `['/robomania/projects/', '/robomania/pt-br/projects/']` |
| `Astro.currentLocale` on `/robomania/pt-br/` | `pt-br` |
| `Astro.currentLocale` on `/robomania/projects/` | `en` |

So the helpers add the base, add the trailing slash, accept a path with or without slashes, and leave the default
language unprefixed. They can replace or sit behind `site/src/lib/href.ts`. `import.meta.env.BASE_URL` stays
`/robomania/` (built), as the docs say for `trailingSlash: 'always'`
(<https://docs.astro.build/en/reference/configuration-reference/#base>).

Two limits of the helpers on this site:

- `astro:i18n` is a virtual module of the build. `href.ts` is also imported by browser scripts
  (`site/src/components/flash/FlashCard.astro:130`, `site/src/lib/flash/createFlasher.ts`) and by a Vitest unit test
  that only stubs `BASE_URL` (`site/tests/unit/href.test.ts`). Whether `astro:i18n` resolves in a browser script, and
  how to resolve it under Vitest, is **not verified**. A pure `href(path, locale)` that prefixes `/pt-br` itself
  avoids the question and keeps the unit test.
- `trailingSlash` governs the dev server and on-demand pages; for prerendered pages the host decides
  (docs: <https://docs.astro.build/en/reference/configuration-reference/#trailingslash>). GitHub Pages already serves
  this site's `…/index.html` files, and the new `pt-br/…/index.html` files have the same shape (built).

### 1.4 What a static build does with each routing option (built)

- **`prefixDefaultLocale: false`, no fallback.** Astro builds exactly the page files that exist. A route with no
  `pt-br` page file has no `pt-br` URL.
- **`fallback: { 'pt-br': 'en' }`, `fallbackType: 'redirect'`.** For each English route without a `pt-br` page file,
  Astro writes `pt-br/…/index.html` holding
  `<meta http-equiv="refresh" content="2;url=/robomania/projects/">`, `<meta name="robots" content="noindex">` and a
  canonical link to the English URL. The redirect has a 2-second delay and carries no client router.
- **`fallbackType: 'rewrite'`.** The same files hold the English page's HTML instead. In that render
  `Astro.currentLocale` is `pt-br` but `Astro.url.pathname` is the English path, `/robomania/projects/`;
  `Astro.originPathname` holds the requested one
  (docs: <https://docs.astro.build/en/reference/api-reference/#originpathname>). A layout that writes
  `lang={Astro.currentLocale}` then labels English text as `pt-br`.
- **`prefixDefaultLocale: true`.** The docs say an unprefixed URL returns 404
  (<https://docs.astro.build/en/guides/internationalization/#prefixdefaultlocale-true>). A static build still writes
  every unprefixed page file it finds: the 404 comes from the middleware, which a static host does not run. The pages
  must be moved into `src/pages/en/` by hand. With `redirectToDefaultLocale: true`, `index.html` becomes a
  2-second meta refresh to `/robomania/en/`.
- Each build with `fallback` set printed one warning, `Could not render … as it conflicts with higher priority
  route`. Its cause was not investigated.

## 2. Content collections per language

### 2.1 Folder per language

Astro's recipe puts a folder per language inside each collection and reads the language from the entry's `id`
(docs: <https://docs.astro.build/en/recipes/i18n/#use-collections-for-translated-content>):

```
site/src/content/projects/en/blink.md      id: en/blink
site/src/content/projects/pt-br/blink.md   id: pt-br/blink
```

The `glob()` loader derives the `id` from the path relative to `base`, so the pattern must become `**/*.md`; a
`slug` in the frontmatter or a `generateId` function overrides it
(docs: <https://docs.astro.build/en/guides/content-collections/#defining-custom-ids>,
<https://docs.astro.build/en/reference/content-loader-reference/#generateid>). One language is selected with
`getCollection('projects', ({ id }) => id.startsWith('pt-br/'))`
(docs: <https://docs.astro.build/en/guides/content-collections/#filtering-collection-queries>). Built: the ids above
are what astro 7.4.6 produces.

A second shape is a collection per language, `projects` and `projectsPtBr`, each with its own `glob()` base. It keeps
today's ids, at the cost of a lookup by collection name everywhere. Astro's docs do not describe it.

### 2.2 What breaks when the id gains a language

Every place that uses `entry.id` as a slug or a key (here):

- `site/src/pages/projects/[id].astro:15` and `site/src/pages/learn/[id].astro:11` use it as the URL parameter.
- `project.data.topics` lists topic ids, read by `getEntry('topics', id)` (`projects/[id].astro:20`) and by
  `p.data.topics.includes(topic.id)` (`learn/[id].astro:16`).
- `workbenchFor(project.id)` (`projects/[id].astro:21`, `flash/index.astro`) keys the workbench by project.
- `sketchNames()` builds `/projects/${id}/` (`site/src/lib/board/names.ts:42`).

A helper that splits `id` into `{ locale, slug }` and is the only reader of `entry.id` keeps these four correct.

### 2.3 A missing translation

Astro's `i18n.fallback` works on **routes**, not on collection entries
(docs: <https://docs.astro.build/en/guides/internationalization/#fallback>: Astro builds a page in `fr/` "for every
page that exists in" `es/`). Built, with `src/pages/pt-br/projects/[id].astro` returning only the translated entries
from `getStaticPaths()` and `en/servo.md` untranslated: `/robomania/pt-br/projects/servo/` was **not** built under
`redirect` or under `rewrite`, while `/pt-br/projects/`, which had no page file at all, was. So Astro fills a missing
route file and leaves a missing entry of an existing dynamic route as a 404.

The fallback this site needs is therefore written in `getStaticPaths()`: for each language and each slug, take the
entry of that language, else the English one, and pass a `translated` flag as a prop. Built with one page file at
`src/pages/[...lang]/projects/[id].astro`:

| URL | `Astro.currentLocale` | Entry rendered |
| --- | --- | --- |
| `/robomania/projects/servo/` | `en` | `en/servo` |
| `/robomania/pt-br/projects/blink/` | `pt-br` | `pt-br/blink` |
| `/robomania/pt-br/projects/servo/` | `pt-br` | `en/servo`, `translated: false` |

`Astro.url.pathname` is the real URL in all three, so the navigation's `aria-current` test in
`site/src/layouts/Base.astro` keeps working. On an untranslated page the body block takes `lang="en"`, a notice says
the page is not translated yet, and the page is left out of the `hreflang` set or points its canonical link at the
English URL (section 4).

`getStaticPaths()` cannot see constants declared outside it in the same frontmatter: the build failed with
`LOCALES is not defined` until the list moved inside the function (built). Import it from a module instead.

### 2.4 Frontmatter that holds text

Translated per entry: `title`, `summary`, `steps[].idea`, `flash.next` (`site/src/content.config.ts`). Language-free,
and now duplicated across the two files of an entry: `art`, `level`, `state`, `order`, `sketch`, `steps[].id`,
`steps[].sketch`, `example`, `flash.baud`, `topics`. A translated file that drifts from the English one in these is a
bug the schema does not catch; reading them from the English entry only, or a build-time check that they match,
closes it. `topics.family` is an enum of English display strings, `'Electronics'`, `'Inside the ESP32'` and so on,
used both as the group key and as the heading in `site/src/pages/learn/index.astro:20-22`; it needs a key and a
label per language.

## 3. UI strings

### 3.1 Without a library

Astro's recipe is a dictionary and two functions
(docs: <https://docs.astro.build/en/recipes/i18n/#translate-ui-strings>): `src/i18n/ui.ts` exports
`ui = { en: { 'nav.home': 'Home' }, fr: { … } } as const`, and `useTranslations(lang)` returns
`t(key)`, which falls back to the default language for a missing key. With `as const`, `t` accepts only keys of the
default language, so `astro check` rejects a misspelt key. With i18n routing configured, `Astro.currentLocale`
replaces the recipe's `getLangFromUrl(Astro.url)`.

In `.astro` frontmatter this is `const t = useTranslations(Astro.currentLocale)`, evaluated at build time; no
dictionary reaches the browser.

Browser TypeScript is different on this site. `site/src/lib/flash/wording.ts` exports sentences as module constants
(`NO_PORT`, `PORT_BUSY`, `FLASH_MODE`) and functions that build English sentences (`noImage`, `otherBoardOrStep`).
The client router runs a page's script once per visit, not once per page (`site/src/lib/page.ts`), so a constant is
bound to the language of the first page the visitor opened. The usual static-site answers:

1. **Both dictionaries in the bundle, language read at call time.** `wording.ts` becomes
   `wording(locale)` returning the sentences, and the caller passes `document.documentElement.lang`, or the component
   passes it down. It stays DOM-free and unit-testable, which
   `docs/standards/website-sources.md` requires of `lib/`. Cost: both languages ship to every visitor; `wording.ts` is
   65 lines.
2. **The page hands the strings to the script.** The component renders the current language's strings into a
   `data-*` attribute, as `site/src/components/board/Dock.astro` already does with `data-names` and `data-manifest`.
   Only one language ships, but a persisted element keeps the attributes of the first page (section 5.1).

Sentences with a variable need a function per language, not a template with a hole: `noImage()` writes "an ESP32",
and Portuguese agrees articles by gender and orders the clause differently.

### 3.2 With a library

Astro ships no message library; the recipe points to the integrations directory
(docs: <https://docs.astro.build/en/recipes/i18n/#community-libraries>).

Paraglide JS compiles message files into one tree-shakable function per message, `m.greeting({ name })`, and says it
works on client and server and with a static Astro build (paraglide). Its Astro page sets up `output: 'server'` with
a middleware first and refers static sites to a separate guide, which was not read; it does not mention Astro's own
i18n routing. How its locale strategy sits beside `Astro.currentLocale`, and whether its Vite plugin builds under
Astro 7.4.6, is **not verified**.

For two languages and a few hundred strings, the dictionary of 3.1 does the same job with no dependency, and
`docs/standards/website-sources.md` keeps the site's dependencies to Astro and single-purpose libraries. A library
starts to pay when plurals, more languages or outside translators arrive.

## 4. `hreflang`, the language switcher and `<html lang>`

**`<html lang>`.** `site/src/layouts/Base.astro:25` hard-codes `lang="en"`. Astro's recipe sets it from the current
language in the base layout (docs: <https://docs.astro.build/en/recipes/i18n/#translate-ui-strings>, step 4). The
client router's swap copies the new page's `<html>` attributes onto the document, `lang` included
(docs: <https://docs.astro.build/en/reference/modules/astro-transitions/#swaprootattributes>; source:
`dist/transitions/swap-functions.js`, `swapRootAttributes`), so a page reached by a link gets the right `lang`
without a reload. The URL segment `pt-br` is what `Astro.currentLocale` returns (built); writing the attribute as
`pt-BR` takes a small map from locale to language tag, which the switcher's labels need anyway.

**`hreflang`.** Astro's core emits none; its docs name `hreflang` only for the sitemap integration. The layout writes
the links with `getAbsoluteLocaleUrl()`:

```html
<link rel="alternate" hreflang="en" href="https://lmarqs.github.io/robomania/projects/blink/" />
<link rel="alternate" hreflang="pt-BR" href="https://lmarqs.github.io/robomania/pt-br/projects/blink/" />
<link rel="alternate" hreflang="x-default" href="https://lmarqs.github.io/robomania/projects/blink/" />
```

Google's rules (google: <https://developers.google.com/search/docs/specialty/international/localized-versions>): each
version lists itself and every other version; URLs are fully qualified; a pair that does not point both ways is
ignored; `x-default` is recommended, not required; HTML links, HTTP headers and a sitemap are equivalent. A `pt-br`
URL that shows the English text (section 2.3) is not a Portuguese version: leave it out of the set and give it a
canonical link to the English URL. `@astrojs/sitemap` has an `i18n` option that writes the same alternates into the
sitemap (docs: <https://docs.astro.build/en/guides/integrations-guide/sitemap/#i18n>); the site has no sitemap
today, and the links in `<head>` are enough.

**Switcher.** Astro's recipe is a component with one link per language
(docs: <https://docs.astro.build/en/recipes/i18n/#let-users-switch-between-languages>); its basic form links to each
language's home, and the "hide default language" variant computes the same page in the other language. Here that is
`getRelativeLocaleUrl(other, pathWithoutLocale)`. Each link carries `lang` and `hreflang` of its target. Section 5.1
says why it should reload the page.

**First visit.** A static page cannot read `Accept-Language` (section 1.1). The choices are no detection, with the
switcher and `hreflang` doing the work, or a small inline script that reads `navigator.languages` on the first visit
and remembers the choice in `localStorage`. Astro's docs describe neither for static sites; the script is this
site's to write.

## 5. What changes in this repository

### 5.1 Traps

1. **The dock keeps the first page's language.** `site/src/components/board/Dock.astro:28` is
   `transition:persist="board-dock"`, and its script mounts once (`dock.dataset.mounted`). On a swap the router moves
   the old element into the new page (docs: <https://docs.astro.build/en/guides/view-transitions/#maintaining-state>;
   source: `swapBodyElement`). Its server-rendered labels, its `data-names` with each project's title and path, and
   every string `connection.ts` and `wording.ts` already produced stay in the language of the first page. After a
   switch by link, a Portuguese page carries an English dock whose links lead to English pages.
2. **A reload fixes the dock and drops the board.** `site/src/layouts/Base.astro:32` says why the router is there:
   pages swap in place "so the visitor's board keeps its port". A switcher link with `data-astro-reload` forces a
   full navigation (docs: <https://docs.astro.build/en/guides/view-transitions/#preventing-client-side-navigation>),
   which repaints everything in the new language and closes the port; the site has no `navigator.serial.getPorts()`
   call to reopen it (here: `grep` finds only `requestPort`). Either accept that, and disable the switcher while a
   flash runs, or make the dock repaint: render it per language, give the persisted element what it needs in both
   languages, and repaint on `astro:after-swap` when `document.documentElement.lang` changed. The second is the
   larger change and touches at least `Dock.astro`, `connection.ts` and `dockMonitor.ts`.
   Naming the persisted element per language (`board-dock-pt-br`) does not work as is: the router would replace the
   dock, and the script that mounts it does not run again.
3. **Astro's fallback redirect drops the board too.** The redirect page has no client router, and the router does a
   full page load to any page without one (source: `dist/transitions/router.js`, "If ClientRouter is not enabled on
   the incoming page, do a full page load to it"; docs:
   <https://docs.astro.build/en/guides/view-transitions/#preventing-client-side-navigation>). Every link to an
   untranslated `pt-br` page would wait 2 seconds and close the port.
4. **Module constants are read once.** Section 3.1. It applies to `wording.ts`, and to every English literal in
   `site/src/lib/board/connection.ts`, `site/src/lib/flash/settings.ts`, `site/src/lib/workbench/steps/*.ts` and
   the view modules beside the components. Which of these hold visible copy was found by a search for quoted
   sentences, not by reading each file.
5. **Tests pin English.** `site/tests` holds 154 literal `/robomania/` URLs in 19 files and 321
   `getByRole`/`getByText`/`getByLabel` locators in 13 end-to-end specs, most with an English name
   (`getByRole('link', { name: 'Projects' })`). They keep passing only if English URLs and English copy stay as they
   are, which layouts 1 and 2 guarantee and layout 3 does not. Unit tests assert English sentences from
   `wording.ts`, `connection.ts` and the view modules; a `wording(locale)` signature changes each call.
6. **Links written by hand.** `href()` is called in 10 files; a link built without the language leaves the
   Portuguese site silently. Markdown bodies were checked for site-relative links only by a search for `/robomania`,
   which found none; links written another way were not searched for.
7. **Simulated board output stays English.** The workbench prints what the sketches print (`HIGH`, `LOW`,
   `delay 500` in `site/src/lib/workbench/steps/blink.ts`), and the dock shows real board output. Those lines are the
   firmware's and are not translated; the labels around them are.
8. **Sketch names in the dock.** `sketchNames()` gives one title and one path per sketch
   (`site/src/lib/board/names.ts`). With two languages it needs the title and path of the current one, or both.

### 5.2 Files touched, for layout 1

| File | Change |
| --- | --- |
| `site/astro.config.mjs` | Add `i18n: { locales: ['en', 'pt-br'], defaultLocale: 'en' }`. |
| `site/src/content.config.ts` | Patterns become `**/*.md`; `family` becomes a key. |
| `site/src/content/projects/*.md` (7), `topics/*.md` (18) | Move into `en/`; add `pt-br/` files as they are translated. About 7,500 words in all. |
| `site/src/pages/**` (7 page files) | Move under `src/pages/[...lang]/`; each gets `getStaticPaths()` over the languages; `[id].astro` adds the per-entry fallback. |
| `site/src/i18n/` (new) | The dictionary, `useTranslations`, the locale list and tags, the `{ locale, slug }` id helper. Where it sits under `lib/` or beside it is a `docs/standards/website-sources.md` decision. |
| `site/src/lib/href.ts` | Takes the language; `site/tests/unit/href.test.ts` gains cases. |
| `site/src/layouts/Base.astro` | `lang`, navigation labels, footer, `hreflang` and canonical links, the switcher. |
| `site/src/components/**/*.astro` (25) | Visible text and `aria-label`s through `t()`. The largest are `workbench/Workbench.astro` (429 lines), `flash/FlashCard.astro` (259) and `board/Dock.astro`. |
| `site/src/lib/flash/wording.ts`, `settings.ts`; `site/src/lib/board/connection.ts`, `names.ts`, `models.ts`; `site/src/lib/workbench/steps/*.ts`; the view modules in `site/src/components/{board,flash,workbench}/*.ts` | Strings per language (section 3.1). |
| `site/tests/unit/*`, `site/tests/e2e/*` | Signatures that gain a language; new specs for a `pt-br` page, the switcher, the untranslated notice and the dock after a switch. |
| `docs/standards/website-ux.md`, `website-sources.md`, `docs/architecture.md`, `AGENTS.md` | Where translated text goes, and the content path `site/src/content/{projects,topics}/` that `AGENTS.md` names. |

`.github/workflows` needs no change: the build still writes `site/dist`, now with a `pt-br/` folder.

## 6. Three layouts compared

| | 1. English unprefixed, one page file per route, fallback per entry | 2. English unprefixed, `pt-br/` page files, Astro `fallback` | 3. Both prefixed, `/en/` and `/pt-br/` |
| --- | --- | --- | --- |
| Config | `locales`, `defaultLocale` | plus `fallback: { 'pt-br': 'en' }`, `fallbackType` | plus `prefixDefaultLocale: true`, `redirectToDefaultLocale: true` |
| Pages | `src/pages/[...lang]/…`, 7 files | 7 English files and up to 7 `pt-br/` wrappers | `src/pages/[lang]/…` or two folders, plus a root `index.astro` |
| English URLs | Unchanged (built) | Unchanged (built) | All change; `/robomania/` becomes a 2-second meta refresh (built) |
| Untranslated entry | English body under Portuguese chrome at the `pt-br` URL, flagged (built) | 404 for an entry of a dynamic route; redirect or mislabelled rewrite for a whole route (built) | As 1 or 2, by the page layout chosen |
| Board connection | Kept on every link except the switcher (section 5.1) | Lost on every redirect | Lost on the root redirect |
| Existing tests | URLs and English locators hold | Hold | 154 URL literals change |
| Inbound links to today's URLs | Hold | Hold | Break unless each old URL keeps a redirect page |
| Astro features used as documented | `locales`, `currentLocale`, helpers. An optional rest parameter as the language is routing the docs do not show for i18n; it built and gave the right `currentLocale` | Everything, as the guide lays it out | Everything |
| Cost | One fallback function to own; all UI copy through `t()` | The same copy work, duplicated wrappers, and the fallback's three defects | The same copy work, plus the URL migration and test rewrite |
| What it buys | The smallest change that keeps the board and the URLs | Nothing layout 1 lacks | Symmetric URLs: no language is "the default" in the address |

The copy work is the same in all three and is most of the job: every `.astro` file, the browser modules of section
5.2 and 25 Markdown pages. The layouts differ in routing, which is the small part, so the choice turns on what each
breaks: layout 2 breaks the board connection and single entries, layout 3 breaks every existing URL.

## 7. Not verified

- Anything in a browser: the swap of `lang` on navigation, the dock after a language switch, the port closing on a
  reload. Each is read from Astro's source or this repository's comments, not observed.
- `astro:i18n` imported from a browser `<script>` or under Vitest (section 1.3).
- `<ClientRouter />` together with `i18n` in one build: the scratch builds left the router out.
- `{ path: 'pt-br', codes: ['pt-BR'] }` as the locale, and what `Astro.currentLocale` returns for it.
- The cause of the `Could not render …` warning in builds with `fallback`.
- That GitHub Pages serves the new folders as it serves today's: inferred from the files having the same shape.
- Paraglide's static-site setup and its fit with Astro 7.4.6 (section 3.2). Other message libraries were not
  examined.
- Google's rules were read through a summarising fetch tool; the quoted points match the page as summarised, not a
  verbatim read. The casing of `pt-BR` in `lang` and `hreflang` follows that page's `en-GB` examples and its
  statement that the value is case-insensitive; the HTML and BCP 47 texts were not read.
- The docs sources were read from `withastro/docs` `main`, which the live site is built from; the two were not
  compared page by page.

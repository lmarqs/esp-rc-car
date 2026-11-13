# PRD: The dock as the only board surface

## Overview
Robomania's website (`site/`, Astro 7) talks to the visitor's ESP board over Web Serial. Today three surfaces each
turn the same flash session state into a button, words and a picture: the project-page card
(`site/src/components/flash/view.ts` `viewFor`), the workbench's My board view (`site/src/lib/workbench/link.ts`
`boardAction`, `site/src/components/workbench/view.ts` `boardMessage`/`waitingMessage`, `PaneState.pressed/tried/
flashed/dismissed` in `site/src/lib/workbench/pane.ts`, `press()`/`retry()` in `Workbench.astro`) and the board dock
(`site/src/components/board/dockView.ts`, `Dock.astro`). Their wording and press rules differ, the workbench pane
swaps the LED/watch layout for a wiring picture whenever the board does not run the selected step, and nothing in
the pane disconnects.

This change makes the board global: one deep **Board connection** module owns press → session events, the words and
the picture for every state; the dock, on every page, is the only place that shows it (action, picture, message,
Disconnect, Serial); the workbench pane always shows the sketch (LED, watch, trace) and only switches its data
source; the card keeps only its settings form.

## Goals
- One module decides the action, message and picture for every session state; no other module words a failure.
- The dock is the only surface with Connect/Flash/Try again/Disconnect, on every page.
- The workbench pane never swaps its layout on board events.
- One notion of "the sketch the visitor has open" (`board.open`), replacing `board.use`/`owner` and `open(key)`.
- The card shows only what belongs to its sketch: the settings form.

## Quality Gates

These commands must pass for every user story, run from the repository root:
- `mise run site:build` — runs `astro check` (must report 0 errors, 0 warnings), then builds the site
- `mise run site:test` — Vitest unit tests and Playwright e2e tests against the fake serial port

UI stories are verified by the Playwright e2e suite; each UI story adds or moves e2e tests in `site/tests/e2e/`.

Every story is committed in small commits, one change each, pushed straight to `main` as soon as the gates pass —
no branches, no pull requests. Commit messages end with the attribution line the session gives.

## User Stories

### US-001: Board connection view
**Description:** As a maintainer, I want one pure function that maps the session state, the opened sketch and the
picked board to the dock's action, message, picture and open flag, so that wording and press rules live in one place.

**Acceptance Criteria:**
- [ ] New `site/src/lib/board/connection.ts` exports `connectionView({ state, record, opened, pick, pressed, tried })`
      returning `{ action?: ConnectionAction; message?: BoardMessage; scene: FlashScene; open: boolean }`, where
      `opened` is `{ key: string; title: string } | undefined` and `pick` is a `BoardModel | undefined`.
- [ ] Actions: idle → `Flash ‹title›` (event `connect`) when a sketch is open, else `Connect board` (event
      `connect`); connecting/flashing/settings/reading/applying → disabled `Connecting…` or `Flashing…`, named from
      `pressed` when set, else from the state kind; running (not lost) → `Flash ‹title›` (event `flash`) when a
      sketch is open, else none; flashMode and lost → `Connect again` (event `connect`); noPort, portBusy, noAnswer,
      noDownload, dropped → `Try again` (event `retry` when `tried` is `flash` or `retry`, else `connect`); noImage →
      `Connect board`; unsupported → none.
- [ ] Messages: `boardMessage` and the `RETRY` sentence move from `site/src/components/workbench/view.ts` into
      `connection.ts` unchanged in wording; the flash-switch line "Press reset on its adapter…" for a running
      unnamed sketch on an ESP-01S comes from here.
- [ ] A flash refusal (`running.flashRefused`) is shown only while `flashRefused.key === opened?.key`.
- [ ] `scene` is `flashScene(state, pick)`; `flashScene`, `FlashScene` and `chipLevel` move from
      `site/src/components/board/flashPicture.ts` to `site/src/lib/board/flashScene.ts` (the painters stay).
- [ ] `open` is true while busy, in flashMode, in any failure, lost, or showing a refusal; false in idle, running and
      unsupported.
- [ ] New `site/tests/unit/boardConnection.test.ts` covers each state × (sketch open / none) row above, the refusal
      rule and `open`; `site/tests/unit/flashPicture.test.ts` imports from the new path.
- [ ] Nothing renders `connectionView` yet; existing behaviour and tests are unchanged.

### US-002: One opened sketch on the board
**Description:** As a maintainer, I want each page part to open its sketch once with everything the session needs,
so that "the page's sketch" has one owner and one lifetime.

**Acceptance Criteria:**
- [ ] `site/src/lib/board/board.ts`: `open(use: BoardUse, title: string, signal: AbortSignal)` replaces
      `use(owner, use)` and `open(key, signal)`; `opened: { use: BoardUse; title: string } | undefined` replaces
      `owner` and the old `opened`. The opened sketch clears when its `signal` aborts, unless another was opened since.
- [ ] Opening does not configure the session; the session is configured at press time (US-003).
- [ ] Callers: `Workbench.astro` opens the selected step (key, manifest, baud, the step's title as the rail names
      it) on mount and on every tab change; `FlashCard.astro` opens its sketch when not inside a `[hidden]` panel;
      `site/src/pages/flash/index.astro` opens the picked project's card sketch on each pick.
- [ ] `FlashCard.astro`'s `claim` and `shownState` are removed; the card renders the session state as it is.
- [ ] The dock's Flash button reads `board.opened`; its label stays `Flash ‹title›`.
- [ ] `site/tests/unit/board.test.ts` covers open, replace, clear on abort, and no clear when another was opened.

### US-003: Dock panel and the one action
**Description:** As a visitor, I want the dock to show the board's connection — the action, the picture of computer,
cable and chip, and what is happening — on every page, so that the board feels like one global thing.

**Acceptance Criteria:**
- [ ] `connection.ts` adds `createConnection(board, pick)`: subscribes to the board, keeps `pressed`/`tried` (the
      rules now in `reducePane`'s `session`/`press` cases), exposes `view` (from `connectionView`), `subscribe` and
      `press()`.
- [ ] `press()` configures the session from `board.opened.use` when not busy, then sends: `connect` with a sketch open
      → `{ type: 'connect' }` (connects and flashes it, entering `settings` for a sketch with settings); `connect`
      with none open → `restartConnection(pick)` from `site/src/lib/board/models.ts`; `flash` →
      `{ type: 'flash', key: opened.use.sketch }`; `retry` → connect, then flash if the board answered (the logic of
      `Workbench.astro`'s `retry()`).
- [ ] `Dock.astro` gets a panel `[data-dock-panel]` above the bar, next to the serial monitor: `<FlashPicture>` with
      the action button in its slot, `<HandHint>`, and the message in an `aria-live="polite"` element. It shows while
      `view.open`.
- [ ] The action button's markup and styles move from `Stage.astro` (164 px wide, icons plug/bolt/again, spinner,
      `aria-disabled` while busy). The panel redefines `--ink`, `--card` and `--faint` so the picture draws light on
      the dark dock; `FlashPicture.astro` and `HandHint.astro` are not edited.
- [ ] The bar shows the action button while the panel is closed, then Disconnect and Serial. The separate
      `Connect board` and `Flash ‹title›` buttons are replaced by it. `dockView` keeps only chip, doing, sketch,
      path, last, progress, disconnect and canSend.
- [ ] `site/tests/e2e/board-dock.spec.ts` covers: panel with progress while flashing; Try again after a dropped flash
      reflashes in one press; Connect again after flash mode; the PROG hand hint after noAnswer on a picked ESP-01S;
      the panel folds away once running; Disconnect visible in the bar while running; the bar keeps Serial in place
      and one row at 860 px.

### US-004: Workbench pane shows the sketch only
**Description:** As a visitor, I want the workbench pane to keep the LED, watch and trace in place whatever the board
does, so that it never toggles to a wiring picture.

**Acceptance Criteria:**
- [ ] `site/src/lib/workbench/pane.ts`: `PaneState` loses `pressed`, `tried`, `flashed`, `dismissed`; the `press`
      event, `paneAction` and `showsRefusal` are removed.
- [ ] `site/src/lib/workbench/link.ts`: `boardAction`, `BoardAction`, `RETRYABLE`, `ICONS`, `CONNECT` are removed;
      `boardStatus`, `paneMode`, `boardDot`, `isConnected` stay.
- [ ] `site/src/components/workbench/paneView.ts`: `LinkView` loses `action`, `message`, `scene`; `linkMessage` is
      removed. `site/src/components/workbench/view.ts` loses `boardMessage`, `waitingMessage`, `RETRY`.
- [ ] `Stage.astro`: the `.link` layer and the `.stage[data-message]` swap are removed; in waiting mode the LED row
      and watch stay in place, dimmed, and the tag title says the board's status (`Not connected`, `Runs commands`,
      the reset hint).
- [ ] `boardLink.ts` paints the switch, dot, tag and mode only; keyboard focus that was on the removed button goes to
      the switch's My board half; `Workbench.astro` loses `press`, `retry` and the action handler.
- [ ] Flashing tests in `site/tests/e2e/workbench-board.spec.ts` ("flashing from the workbench", the stage-height
      and button-position tests) move to the dock spec or are replaced by: the pane keeps its layout and height while
      the board connects, flashes, fails and runs; flashing the selected step from the dock makes the pane Live.
- [ ] Unit tests in `workbenchPane`, `workbenchLink`, `workbenchView`, `workbenchPaneView` lose the removed parts.

### US-005: Card keeps only its settings
**Description:** As a visitor on a project page, I want the card to hold only the sketch's settings, so that
connecting and flashing happen in the dock like everywhere else.

**Acceptance Criteria:**
- [ ] `FlashCard.astro` removes the picture, hand hint, step pills, output terminal and the
      Connect/Flash again/Disconnect/failure buttons.
- [ ] The card shows its settings form in `settings`, `reading` and `applying`, with Cancel, submit and field errors
      in its message, and `Change settings` while the board runs its sketch; otherwise one line pointing at the
      board bar below.
- [ ] `site/src/components/flash/view.ts` `viewFor` keeps only the settings part (`settingsView` and the running
      Change settings action); its connect and failure cases are removed.
- [ ] The card keeps `data-busy`, so `site/src/pages/flash/index.astro`'s lock still works.
- [ ] `flash-card.spec.ts`, `flash-settings.spec.ts` and `flash-page.spec.ts` drive connect and flash through the
      dock and check the card's form; `flashCardView.test.ts` covers the slimmed `viewFor`.

### US-006: Docs and release
**Description:** As a maintainer, I want the docs to describe the dock as the board surface, and the site released.

**Acceptance Criteria:**
- [ ] `docs/architecture.md` describes the Board connection module, `board.open`, the dock panel, the workbench pane
      that shows the sketch only, and the settings-only card; the old card-ownership and My board view paragraphs
      are rewritten, not appended to.
- [ ] `docs/standards/website-ux.md` rules 1, 6 and 12 name the dock's action button instead of the My board view's.
- [ ] The full Done check from `AGENTS.md` passes, each result reported.
- [ ] The last commit message contains `#site-release`; the `site` workflow run succeeds.

## Functional Requirements
- FR-1: The dock must show exactly one action button for the board at a time, in the panel when it is open, else in
  the bar.
- FR-2: The dock panel must open while the session connects, flashes, waits in flash mode, failed, is lost, or shows
  a refusal for the opened sketch, and close when idle or running.
- FR-3: With a sketch open, the dock's action must flash that sketch from idle in one press, and from running in one
  press.
- FR-4: Try again after a failed flash must connect and flash in one press.
- FR-5: Disconnect must be in the dock's bar whenever a board is connected.
- FR-6: The workbench pane must keep the same layout and height in simulator, live and waiting modes.
- FR-7: Only `site/src/lib/board/connection.ts` may word session failures.
- FR-8: Leaving a page must clear the sketch it opened; a page with no sketch (Learn) offers Connect, not Flash.

## Non-Goals
- No firmware or `lib/` changes.
- No change to the flash session state machine (`site/src/lib/flash/session.ts`) or the fake flasher.
- No new board models or pick behaviour; the pick still follows the chip that answers.
- No redesign of the serial monitor.

## Technical Considerations
- `Dock.astro` is persisted across pages with `transition:persist`; page scripts run per page via `onEveryPage`
  (`site/src/lib/page.ts`) and get a `signal` that aborts on page swap — use it for `board.open`.
- Reuse `paintFlashPicture` and `paintHandHint` (`site/src/components/board/flashPicture.ts`).
- UX standard rules (`docs/standards/website-ux.md`): nothing shifts, icon plus word, reduced motion.
- No file may cross 1,000 lines; `Workbench.astro` (458) and `Dock.astro` (~290) should shrink or stay put.

## Success Metrics
- The removed modules (`boardAction`, `boardMessage`/`waitingMessage` in the workbench, `viewFor`'s connect and
  failure cases, `PaneState.pressed/tried/flashed/dismissed`) no longer exist.
- Every session state's wording is pinned once, in `boardConnection.test.ts`.
- The e2e suite covers connect, flash, failure, retry, flash mode and disconnect through the dock.

## Open Questions
- None blocking. The card's idle line wording ("Connect and flash it from the board bar below.") is the builder's
  call within the UX standard.

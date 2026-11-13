---
description: Sets the twelve rules every page and component of the Robomania website follows for layout, colour, wording, input, accessibility and motion.
audience: Whoever designs or reviews a page or interactive component in site/; knows HTML, CSS and TypeScript
---
# Website UX

Every page and component in `site/` follows the rules below, and a new one is checked against them. No check
enforces them. The workbench is the website's densest interface: code with an arrow beside a simulated or real
board. [The approved mockup](../../site/design/workbench-mockup.html) is its design reference, and each rule
gives one place where the mockup follows it. The mockup opens from disk and switches between a board that is not
connected, one running the shown step and one running another step.

A MUST does not vary. A SHOULD yields only to a reason written beside the code. Rules are cited by number.

1. **Nothing shifts.** A state change MUST NOT move or resize a neighbour, and anything whose text changes MUST
   reserve the width of its longest text. A visitor aims at a control and presses it; if the control moves under the
   pointer, the press lands on something else. Example: the dock panel's action is 164 px wide whether it reads
   Connect board, Flash Blink · input or Flashing…, the bar's pill 196 px, the switch's halves are 104 px each whichever is pressed, and the
   debugger's Pause button keeps its width when it reads Continue.
2. **Group by direction.** What the board reports MUST sit together, and what the visitor sends MUST sit together,
   next to where the reply appears. A visitor who sends a value looks for its effect, and the nearer the two are,
   the less they search. Example: the LED, the watch table and the 10-second trace of GPIO 2 form one block of
   reports; the serial output, the command line, the shortcut chips and the delay slider form one terminal, with
   the command line directly under the output the board answers in.
3. **One meaning per colour.** Yellow means new or sent, coral means running or the main action, and green means live
   or applied. A colour with two meanings teaches the visitor to ignore it. Example: a line new in this step has a
   yellow background, and a line the visitor sent is yellow in the terminal; the line the board is about to run is
   coral; the My board half's dot when a board is connected, the mark on the tab the board runs, the Live frame, the
   lit LED and the mark for what the board applied are green.
4. **Never colour alone.** A status MUST carry an icon or a word as well. A colour-blind visitor, or one in
   bright light, cannot tell two hues apart. Example: the switch's dark pill sits under the half that names what the
   board pane shows, Simulator or My board, and the line being run has the arrow ▶ in its gutter as well as the coral
   background.
5. **Chrome is not content.** An editor, terminal or card MUST look separate from what it holds, and its lines MUST
   meet at its edges. A visitor then tells the sketch's text from the page's controls, and an unbroken row reads
   as one line. Example: the editor has a tab with the file name and a path of crumbs above the code, and the
   highlighted line fills its whole row up to the editor's edges; the terminal is a dark card of its own around its
   output.
6. **Every state says what to do next, in plain words.** A state MUST NOT leave the visitor to guess the next step.
   Example: below the panes a hint says what the arrow is and that Step runs one line; when the board runs another
   step, its tab is marked "● board", the pane's tag says what the board runs, and the dock's action offers
   "Flash Blink · input" for the step on screen.
7. **A control shows what it sent, and a slider sends on release.** After a control acts, the page MUST show what
   went out, and a slider MUST NOT send while it is dragged, since each intermediate value would reach the board.
   Example: in the commands step, dragging the delay slider updates its number and writes the line it would send,
   such as `delay 1500`, into the command line; releasing it sends that line, which then appears in the terminal in
   yellow and as a yellow mark on the trace.
8. **A shortcut shows the exact text it sends.** A button that stands in for typing MUST type its text into the
   command line first, so the visitor learns the words that work in any serial monitor. Example: the pause chip
   types `pause` into the command line, then sends it.
9. **Phone width works.** At 400 px the panes MUST stack and the page MUST NOT scroll sideways. A long line of code
   scrolls inside its own pane instead. Many visitors read on a phone beside the board. Example: below 820 px the
   code and the board stack, and the code pane scrolls on its own.
10. **Keyboard and labels.** Every control MUST be reachable by keyboard, show a visible focus and have a label that
    names it, since a keyboard user follows the focus and a screen reader reads the label. Example: the debugger
    buttons sit in a toolbar labelled Debugger and outline in blue when focused, and the command line is labelled
    Line to send to the board although it shows only a placeholder.
11. **Motion is optional.** An animation MUST be skipped when the visitor's system asks for reduced motion, and
    what it showed MUST still appear without it. Example: a shortcut types its text into the command line one
    character at a time, and with reduced motion the whole text appears at once.
12. **Every button pairs an icon with a word, and the icon changes when the action changes.** An icon alone is
    guessed at, and a word alone is slower to find. A shortcut chip is the exception: its word is the command it
    types (rule 8), so it shows the word alone. Example: Pause shows a pause icon, and once the sketch is paused the
    same button shows a play icon and reads Continue; the dock's action shows a plug and reads Connect board on a
    page with no sketch, a bolt and Flash Blink · input on a page with one, and a circular arrow and Try again after
    a failed connect or flash.

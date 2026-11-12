import { createTypist } from '../../lib/workbench/typist';
import type { SliderShortcut, StepDefinition } from '../../lib/workbench/step';
import { followedSliderValue, followSlider } from './view';

export interface CommandLineOptions {
  /** The project's steps in rail order, whose shortcuts the markup draws. */
  steps: readonly Pick<StepDefinition<unknown, unknown>, 'shortcuts'>[];
  /** Sends a line the visitor typed, or a shortcut typed for them, to the sketch's serial input. */
  send(text: string): void;
  /** Whether the visitor's system asks for reduced motion: then a shortcut's line appears at once. */
  reduceMotion(): boolean;
}

/** The command line, its shortcut chips and its sliders, as the workbench's markup draws them. */
export interface CommandLine {
  /** Empties the line and drops the line a shortcut was typing, unsent; puts the sliders back to where they start. */
  reset(): void;
  /**
   * Drops the line a shortcut is typing, unsent, when the pane changes hands: it was meant for the board or the
   * simulator the visitor saw, not for the one that takes over.
   */
  dropTyping(): void;
  /**
   * Moves each slider of the `selected` step that follows a board variable when the variable changes, so it reads the
   * last value sent or reported. `variable` gives the shown board's value of a variable by name. A value the visitor
   * released stays until the board reports a change.
   */
  follow(selected: number, variable: (name: string) => string | undefined): void;
}

interface Slider {
  readonly element: HTMLInputElement;
  readonly output: HTMLOutputElement;
  /** The index of the slider's step in rail order. */
  readonly step: number;
  readonly shortcut: SliderShortcut;
  /** The board's value the slider last saw, which it moves away from only when the board changes it. */
  seen: number | undefined;
}

/** Wires the command line, chips and sliders under `root`, which holds one workbench. */
export function mountCommandLine(root: HTMLElement, { steps, send, reduceMotion }: CommandLineOptions): CommandLine {
  const form = root.querySelector<HTMLFormElement>('[data-command]')!;
  const input = root.querySelector<HTMLInputElement>('[data-command-line]')!;
  const stepOf = (control: HTMLElement) => Number(control.closest<HTMLElement>('[data-for-step]')!.dataset.forStep);
  const shortcutOf = (control: HTMLElement) => steps[stepOf(control)].shortcuts[Number(control.dataset.shortcut)];

  const sliders: Slider[] = [];
  for (const element of root.querySelectorAll<HTMLInputElement>('input[type="range"][data-shortcut]')) {
    const shortcut = shortcutOf(element);
    if (shortcut.kind !== 'slider') continue;
    const output = element.nextElementSibling as HTMLOutputElement;
    sliders.push({ element, output, step: stepOf(element), shortcut, seen: undefined });
  }

  /** Shows `text` in yellow: typed by a shortcut, or about to be sent by the slider. */
  const show = (text: string) => {
    input.value = text;
    input.setAttribute('data-typing', '');
  };
  const clearLine = () => {
    input.value = '';
    input.removeAttribute('data-typing');
  };
  const setSlider = (slider: Slider, value: number) => {
    slider.element.value = String(value);
    slider.output.textContent = slider.element.value;
  };
  const typist = createTypist({
    show,
    send(text) {
      clearLine();
      send(text);
    },
    reduceMotion,
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    // A line a shortcut is typing goes out as it would after its pause.
    if (typist.busy) return typist.finish();
    const text = input.value.trim();
    clearLine();
    if (text !== '') send(text);
  });
  input.addEventListener('input', () => {
    typist.stop();
    input.removeAttribute('data-typing');
  });

  // Whether the line the typist holds came from a slider, which a further move of a slider replaces.
  let heldBySlider = false;
  for (const chip of root.querySelectorAll<HTMLButtonElement>('button[data-shortcut]')) {
    const shortcut = shortcutOf(chip);
    if (shortcut.kind !== 'chip') continue;
    chip.addEventListener('click', () => {
      heldBySlider = false;
      typist.type(shortcut.text);
    });
  }

  // The slider under the visitor's pointer, which no value from the board moves.
  let pressed: Slider | undefined;
  for (const done of ['pointerup', 'pointercancel']) window.addEventListener(done, () => (pressed = undefined));
  for (const slider of sliders) {
    const line = () => slider.shortcut.command(Number(slider.element.value));
    slider.element.addEventListener('pointerdown', () => (pressed = slider));
    // Dragging only shows the line; releasing sends it, so the values passed on the way never reach the board.
    slider.element.addEventListener('input', () => {
      // A value the slider passed on the way, as each arrow key press is, gives way to the next one unsent.
      if (heldBySlider) typist.stop();
      else typist.finish();
      slider.output.textContent = slider.element.value;
      show(line());
    });
    slider.element.addEventListener('change', () => {
      heldBySlider = true;
      typist.type(line(), line().length);
    });
  }

  return {
    reset() {
      typist.stop();
      clearLine();
      for (const slider of sliders) {
        setSlider(slider, slider.shortcut.initial);
        slider.seen = undefined;
      }
    },
    dropTyping() {
      typist.stop();
      if (input.hasAttribute('data-typing')) clearLine();
    },
    follow(selected, variable) {
      const typing = input.hasAttribute('data-typing');
      for (const slider of sliders) {
        const { follows } = slider.shortcut;
        if (slider.step !== selected || follows === undefined) continue;
        const reported = followedSliderValue(slider.shortcut, variable(follows));
        const next = followSlider(slider.seen, reported, typing || slider === pressed);
        slider.seen = next.remembered;
        if (next.move === undefined || slider.element.value === String(next.move)) continue;
        setSlider(slider, next.move);
      }
    },
  };
}

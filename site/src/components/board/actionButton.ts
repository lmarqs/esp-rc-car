/** What an `ActionButton` shows. */
export interface ActionFace {
  /** What the button is named. */
  readonly label: string;
  readonly icon: 'plug' | 'bolt' | 'again';
  /** Set while the session works on the last press. */
  readonly disabled: boolean;
}

/** Writes `action` on `button`, an `ActionButton`, laid out by then, so a cut label can be told. */
export function paintAction(button: HTMLButtonElement, action: ActionFace): void {
  const label = button.querySelector<HTMLElement>('[data-action-label]')!;
  label.textContent = action.label;
  // A label cut to the button's width shows whole on hover.
  if (label.scrollWidth > label.clientWidth) button.title = action.label;
  else button.removeAttribute('title');
  button.dataset.icon = action.icon;
  // aria-disabled, not disabled, so a button pressed from the keyboard keeps the focus while the session works.
  if (action.disabled) button.setAttribute('aria-disabled', 'true');
  else button.removeAttribute('aria-disabled');
}

import type { ConnectionAction } from '../../lib/board/connection';

/** Writes `action` on `button`, an `ActionButton`, laid out by then, so a cut label can be told. */
export function paintAction(button: HTMLButtonElement, action: ConnectionAction): void {
  const label = button.querySelector<HTMLElement>('[data-action-label]')!;
  label.textContent = action.label;
  // A label cut to the button's width shows whole on hover.
  if (label.scrollWidth > label.clientWidth) button.title = action.label;
  else button.removeAttribute('title');
  // While the session works, a spinner takes the icon's place.
  if (!action.disabled) button.dataset.icon = action.icon;
  // aria-disabled, not disabled, so a button pressed from the keyboard keeps the focus while the session works.
  if (action.disabled) button.setAttribute('aria-disabled', 'true');
  else button.removeAttribute('aria-disabled');
}

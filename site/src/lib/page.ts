/**
 * Runs `mount` on every page the client router shows, the first one included. The router runs a page's script once
 * per visit to the site, not once per page, so a script that set up its page only when it ran would miss every later
 * page. `signal` aborts as the router swaps the page out: whatever outlives the page's elements, such as a listener
 * on the window, a timer or a subscription to the board, stops with it.
 */
export function onEveryPage(mount: (signal: AbortSignal) => void): void {
  document.addEventListener('astro:page-load', () => {
    const page = new AbortController();
    document.addEventListener('astro:before-swap', () => page.abort(), { once: true });
    mount(page.signal);
  });
}

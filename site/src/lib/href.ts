/** Prefixes a site path with the base the site is served under, such as `/robomania`. */
export function href(path: string): string {
  return import.meta.env.BASE_URL.replace(/\/$/, '') + path;
}

// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://lmarqs.github.io',
  base: '/robomania',
  trailingSlash: 'always',
  // The Library page reads the drivers' headers from the repository's lib/, outside the site's root.
  vite: { server: { fs: { allow: ['..'] } } },
});

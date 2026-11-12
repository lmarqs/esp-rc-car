// @ts-check
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://lmarqs.github.io',
  base: '/robomania',
  trailingSlash: 'always',
  // The browser tests build to their own folder, so they never overwrite the build that `site:build` wrote.
  outDir: process.env.ROBOMANIA_OUT_DIR ?? 'dist',
  // The Library page reads the drivers' headers from the repository's lib/, outside the site's root.
  vite: { server: { fs: { allow: ['..'] } } },
});

// Builds the game into ONE self-contained index.html at the repo root (scripts and styles
// inlined), so GitHub Pages can serve it straight from the main branch. Run: npm run pages
import { build } from 'vite';
import { readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const out = join(root, '.pages-build');

await build({
  root,
  base: './',
  logLevel: 'warn',
  configFile: false,
  build: {
    outDir: out,
    emptyOutDir: true,
    target: 'es2020',
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 5000,
    rollupOptions: { input: join(root, 'game.html'), output: { inlineDynamicImports: true } },
  },
});

const assets = join(out, 'assets');
const files = readdirSync(assets);
const js = readFileSync(join(assets, files.find((f) => f.endsWith('.js'))), 'utf8');
const cssFile = files.find((f) => f.endsWith('.css'));
const css = cssFile ? readFileSync(join(assets, cssFile), 'utf8') : '';
if (/<\/script/i.test(js)) throw new Error('bundle contains </script>; cannot inline');

let html = readFileSync(join(out, 'game.html'), 'utf8');
html = html.replace(/<script[^>]*src="[^"]*"[^>]*><\/script>\s*/g, '');
html = html.replace(/<link[^>]*rel="modulepreload"[^>]*>\s*/g, '');
html = html.replace(/<link[^>]*rel="stylesheet"[^>]*>\s*/g, '');
// Function replacers so `$` sequences in the bundle are left alone.
html = html.replace('</head>', () => `<style>${css}</style>\n</head>`);
html = html.replace('</body>', () => `<script type="module">${js}</script>\n</body>`);
html = html.replace(/<!doctype html>/i, '<!doctype html>\n<!-- Built by "npm run pages" from game.html + src/. Do not edit by hand. -->');
writeFileSync(join(root, 'index.html'), html);
rmSync(out, { recursive: true, force: true });
console.log(`index.html written (${Math.round(html.length / 1024)} KB)`);

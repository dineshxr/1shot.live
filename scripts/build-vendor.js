#!/usr/bin/env node
// Re-build everything under /vendor/ from npm-installed sources.
// Run after `npm install` to refresh self-hosted runtime deps.

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const vendor = path.join(repoRoot, 'vendor');
fs.mkdirSync(vendor, { recursive: true });

const copies = [
  ['node_modules/preact/dist/preact.module.js',      'vendor/preact.module.js'],
  ['node_modules/preact/dist/preact.min.js',         'vendor/preact.min.js'],
  ['node_modules/preact/hooks/dist/hooks.module.js', 'vendor/preact-hooks.module.js'],
  ['node_modules/preact/hooks/dist/hooks.umd.js',    'vendor/preact-hooks.umd.js'],
  ['node_modules/htm/dist/htm.module.js',            'vendor/htm.module.js'],
  ['node_modules/htm/dist/htm.js',                   'vendor/htm.js'],
  ['node_modules/htm/preact/index.module.js',        'vendor/htm-preact.module.js'],
];

for (const [src, dest] of copies) {
  fs.copyFileSync(path.join(repoRoot, src), path.join(repoRoot, dest));
  console.log(`copy  ${src}  →  ${dest}`);
}

// Bundle @supabase/supabase-js into a single self-contained ESM file.
const entryPath = path.join(repoRoot, 'scripts', '_supabase-entry.tmp.js');
fs.writeFileSync(entryPath, `export { createClient } from '@supabase/supabase-js';\n`);
try {
  execSync(
    `npx esbuild ${JSON.stringify(entryPath)} --bundle --format=esm --target=es2020 --minify --outfile=${JSON.stringify(path.join(vendor, 'supabase.esm.js'))}`,
    { stdio: 'inherit', cwd: repoRoot }
  );
  console.log('bundle  @supabase/supabase-js  →  vendor/supabase.esm.js');
} finally {
  fs.unlinkSync(entryPath);
}

console.log('\nDone. Run `npm run build:css` to refresh vendor/tailwind.css too.');

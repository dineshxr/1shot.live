#!/usr/bin/env node
// Programmatic live-server with a middleware that mirrors the production
// Vercel/Netlify rewrites — keeps local dev working with clean URLs like /submit.
// Also runs `tailwindcss --watch` in the background so utility class changes
// are picked up automatically.

const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const liveServer = require('live-server');
const rewrite = require('./dev-rewrite.js');

const repoRoot = path.resolve(__dirname, '..');

// Build vendor/tailwind.css once on startup and then keep it in sync via --watch.
const tailwindArgs = [
  'tailwindcss',
  '-i', 'scripts/tailwind-input.css',
  '-o', 'vendor/tailwind.css',
  '--watch',
];
const tw = spawn('npx', tailwindArgs, { cwd: repoRoot, stdio: 'inherit' });
tw.on('exit', code => {
  if (code !== 0) console.error(`tailwindcss --watch exited with code ${code}`);
});
process.on('exit', () => { try { tw.kill(); } catch (_) {} });
process.on('SIGINT', () => { try { tw.kill(); } catch (_) {} process.exit(0); });

// Ensure vendor/ exists with built deps; warn if missing rather than failing.
if (!fs.existsSync(path.join(repoRoot, 'vendor', 'supabase.esm.js'))) {
  console.warn(
    '\n[dev-server] vendor/supabase.esm.js missing. Run `npm run build:vendor` first.\n'
  );
}

const params = {
  port: Number(process.env.PORT) || 8080,
  host: '127.0.0.1',
  root: repoRoot,
  open: false,
  wait: 200,
  logLevel: 2,
  middleware: [rewrite],
};

liveServer.start(params);

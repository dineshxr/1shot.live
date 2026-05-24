#!/usr/bin/env node
// Programmatic live-server with a middleware that mirrors the production
// Vercel/Netlify rewrites — keeps local dev working with clean URLs like /submit.

const path = require('path');
const liveServer = require('live-server');
const rewrite = require('./dev-rewrite.js');

const params = {
  port: Number(process.env.PORT) || 8080,
  host: '127.0.0.1',
  root: path.resolve(__dirname, '..'),
  open: false,
  wait: 200,
  logLevel: 2,
  middleware: [rewrite],
};

liveServer.start(params);

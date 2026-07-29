#!/usr/bin/env node
// Regenerates the site-wide social share card:
//   og-image.png  (1200x630, used by og:image)
//   twitter-image.png  (same art, referenced by twitter:image)
//
//   node scripts/generate-og-image.js
//
// Rendered with @vercel/og (Satori), the same engine the per-startup card in
// api/og.js uses, so the two stay visually related.
//
// The numbers on the card are REAL and must stay that way:
//   DR 37       — Ahrefs Domain Rating for submithunt.com, measured 2026-07-28
//   1,476       — live listings (of 1,661 submitted)
// Re-measure both before changing them. Do not round up.
//
// Satori supports a subset of CSS. Notably: every element with more than one
// child needs display:flex, there is no filter/blur, and text must sit inside a
// flex parent. Keep that in mind when editing the layout.

import { ImageResponse } from '@vercel/og';
import { writeFileSync, copyFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const DR = 37;
const LIVE_LISTINGS = '1,476';
const HEADLINE = 'Launch your startup everywhere, in just a few clicks';

const ORANGE = '#f97316';
const ORANGE_DEEP = '#c2410c';

const h = (type, props) => ({ type, props: props || {} });

// Inter is the site's typeface. Falls back to the font @vercel/og bundles if
// Google Fonts is unreachable, so the script still produces a valid image.
async function loadFonts() {
  const want = [
    { weight: 500, css: 'https://fonts.googleapis.com/css2?family=Inter:wght@500&display=swap' },
    { weight: 800, css: 'https://fonts.googleapis.com/css2?family=Inter:wght@800&display=swap' },
  ];
  const fonts = [];
  for (const { weight, css } of want) {
    try {
      const sheet = await fetch(css, { headers: { 'User-Agent': 'Mozilla/4.0' } }).then((r) => r.text());
      const url = (sheet.match(/https:\/\/[^)]+\.ttf/) || [])[0];
      if (!url) continue;
      const data = Buffer.from(await fetch(url).then((r) => r.arrayBuffer()));
      fonts.push({ name: 'Inter', data, weight, style: 'normal' });
    } catch {
      /* fall through to the bundled default */
    }
  }
  return fonts;
}

// Deterministic star field — a seeded PRNG so regenerating the image produces
// byte-identical output instead of a noisy git diff every run.
function stars(count) {
  let seed = 20260728;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const out = [];
  for (let i = 0; i < count; i++) {
    const x = rand() * 1200;
    const y = rand() * 630;
    // Keep the text column clear so stars never fight the headline.
    if (x < 660 && y > 250 && y < 560) continue;
    const size = rand() < 0.82 ? 2 : 3;
    const opacity = 0.18 + rand() * 0.5;
    out.push(
      h('div', {
        style: {
          position: 'absolute',
          left: `${x.toFixed(1)}px`,
          top: `${y.toFixed(1)}px`,
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '9999px',
          background: `rgba(255,255,255,${opacity.toFixed(2)})`,
        },
      })
    );
  }
  return out;
}

// Ahrefs-style Domain Rating chip: label, the number, and a 0-100 fill bar.
function drBadge() {
  return h('div', {
    style: {
      display: 'flex',
      flexDirection: 'column',
      background: 'rgba(255,255,255,0.06)',
      border: '1px solid rgba(249,115,22,0.45)',
      borderRadius: '22px',
      padding: '22px 28px 20px 28px',
      width: '232px',
    },
    children: [
      h('div', {
        style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
        children: [
          h('div', {
            style: {
              display: 'flex',
              fontSize: '20px',
              fontWeight: 800,
              letterSpacing: '2px',
              color: '#fdba74',
            },
            children: 'DR',
          }),
          h('div', {
            style: { display: 'flex', fontSize: '64px', fontWeight: 800, color: '#ffffff', lineHeight: 1 },
            children: String(DR),
          }),
        ],
      }),
      // Track + fill, sized to DR/100.
      h('div', {
        style: {
          display: 'flex',
          width: '176px',
          height: '8px',
          borderRadius: '9999px',
          background: 'rgba(255,255,255,0.14)',
          marginTop: '16px',
        },
        children: [
          h('div', {
            style: {
              display: 'flex',
              width: `${Math.round(176 * (DR / 100))}px`,
              height: '8px',
              borderRadius: '9999px',
              background: `linear-gradient(90deg, ${ORANGE_DEEP}, ${ORANGE})`,
            },
          }),
        ],
      }),
      h('div', {
        style: { display: 'flex', fontSize: '16px', color: 'rgba(255,255,255,0.55)', marginTop: '12px' },
        children: 'Ahrefs Domain Rating',
      }),
    ],
  });
}

function card() {
  return h('div', {
    style: {
      width: '1200px',
      height: '630px',
      display: 'flex',
      position: 'relative',
      fontFamily: 'Inter, sans-serif',
      background: 'linear-gradient(135deg, #070b16 0%, #0f172a 52%, #1a1005 100%)',
    },
    children: [
      // Warm glow anchored bottom-right, echoing the brand accent.
      h('div', {
        style: {
          position: 'absolute',
          right: '-260px',
          bottom: '-320px',
          width: '900px',
          height: '900px',
          borderRadius: '9999px',
          background: 'radial-gradient(circle, rgba(249,115,22,0.34) 0%, rgba(194,65,12,0.12) 45%, rgba(0,0,0,0) 70%)',
          display: 'flex',
        },
      }),
      // Planet limb sweeping the lower edge.
      h('div', {
        style: {
          position: 'absolute',
          left: '-180px',
          bottom: '-620px',
          width: '1560px',
          height: '900px',
          borderRadius: '9999px',
          background: 'linear-gradient(180deg, rgba(249,115,22,0.30) 0%, rgba(12,17,32,0) 55%)',
          border: '2px solid rgba(253,186,116,0.30)',
          display: 'flex',
        },
      }),
      ...stars(120),

      // Foreground
      h('div', {
        style: {
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: '1200px',
          height: '630px',
          padding: '64px 68px',
        },
        children: [
          // Wordmark + DR chip
          h('div', {
            style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' },
            children: [
              h('div', {
                style: { display: 'flex', alignItems: 'center' },
                children: [
                  h('div', {
                    style: {
                      width: '62px',
                      height: '62px',
                      borderRadius: '18px',
                      background: `linear-gradient(135deg, ${ORANGE}, ${ORANGE_DEEP})`,
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '36px',
                      fontWeight: 800,
                    },
                    children: 'S',
                  }),
                  h('div', {
                    style: {
                      display: 'flex',
                      fontSize: '40px',
                      fontWeight: 800,
                      color: '#ffffff',
                      marginLeft: '20px',
                      letterSpacing: '-0.5px',
                    },
                    children: 'SubmitHunt',
                  }),
                ],
              }),
              drBadge(),
            ],
          }),

          // Headline
          h('div', {
            style: { display: 'flex', flexDirection: 'column', maxWidth: '820px' },
            children: [
              h('div', {
                style: {
                  display: 'flex',
                  fontSize: '76px',
                  fontWeight: 800,
                  color: '#ffffff',
                  lineHeight: 1.08,
                  letterSpacing: '-2px',
                },
                children: HEADLINE,
              }),
            ],
          }),

          // Footer facts — every one of these is measured, not marketing.
          h('div', {
            style: { display: 'flex', alignItems: 'center' },
            children: [
              h('div', {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.16)',
                  borderRadius: '9999px',
                  padding: '12px 26px',
                  fontSize: '24px',
                  color: '#ffffff',
                },
                children: `${LIVE_LISTINGS} products live`,
              }),
              h('div', {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  background: 'rgba(249,115,22,0.16)',
                  border: '1px solid rgba(249,115,22,0.45)',
                  borderRadius: '9999px',
                  padding: '12px 26px',
                  fontSize: '24px',
                  color: '#fdba74',
                  marginLeft: '16px',
                },
                children: 'Do-follow backlink',
              }),
              h('div', {
                style: {
                  display: 'flex',
                  alignItems: 'center',
                  background: 'rgba(255,255,255,0.08)',
                  border: '1px solid rgba(255,255,255,0.16)',
                  borderRadius: '9999px',
                  padding: '12px 26px',
                  fontSize: '24px',
                  color: '#ffffff',
                  marginLeft: '16px',
                },
                children: 'Free to launch',
              }),
            ],
          }),
        ],
      }),
    ],
  });
}

const fonts = await loadFonts();
if (!fonts.length) console.warn('Inter unavailable — falling back to the bundled font.');

const image = new ImageResponse(card(), { width: 1200, height: 630, ...(fonts.length ? { fonts } : {}) });
const buffer = Buffer.from(await image.arrayBuffer());

writeFileSync(join(ROOT, 'og-image.png'), buffer);
copyFileSync(join(ROOT, 'og-image.png'), join(ROOT, 'twitter-image.png'));

console.log(`og-image.png + twitter-image.png written (${(buffer.length / 1024).toFixed(0)} KB, DR ${DR}, ${LIVE_LISTINGS} live)`);

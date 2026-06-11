import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/utils/cors.ts'

// AI-Powered Form Prefill: fetch the product's homepage, pull logo/cover/social
// links + JSON-LD directly, and ask an LLM (via OpenRouter) to extract the rest
// (name, tagline, description, category, tags, pricing, audience, tech stack,
// SEO, FAQ). Returns a single object the submit form maps onto its fields.

const FETCH_TIMEOUT_MS = 9000
const MAX_BYTES = 3_000_000
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'

const CATEGORIES = [
  'AI/ML', 'SaaS', 'Web App', 'Mobile App', 'Developer Tools', 'Productivity',
  'Design', 'Marketing', 'E-commerce', 'Social', 'API/Service', 'Gaming',
  'Health & Fitness', 'Education', 'Chrome Extension', 'Other',
]

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// SSRF guard — refuse non-public hosts (mirror of verify-backlink).
function isPublicHost(hostname: string): boolean {
  const h = (hostname || '').toLowerCase().replace(/^\[|\]$/g, '')
  if (!h) return false
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') ||
      h.endsWith('.internal') || h.endsWith('.lan') || h === 'metadata' || h === 'metadata.google.internal') return false
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return false
  if (h.includes(':')) return false
  if (!h.includes('.')) return false
  return true
}

async function fetchPage(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SubmitHuntPrefillBot/1.0; +https://submithunt.com)',
        'Accept': 'text/html,application/xhtml+xml',
      },
    })
    if (!res.ok) throw new Error(`The site returned HTTP ${res.status}.`)
    const reader = res.body?.getReader()
    if (!reader) return await res.text()
    const decoder = new TextDecoder()
    let html = ''
    let received = 0
    // deno-lint-ignore no-constant-condition
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      html += decoder.decode(value, { stream: true })
      if (received >= MAX_BYTES) { try { await reader.cancel() } catch (_e) { /* ignore */ } break }
    }
    return html
  } finally {
    clearTimeout(timer)
  }
}

function absolutize(href: string, base: string): string {
  try { return new URL(href, base).toString() } catch { return '' }
}

function firstMatch(re: RegExp, s: string): string {
  const m = s.match(re)
  return m ? (m[1] || m[2] || m[3] || '').trim() : ''
}

function metaContent(html: string, prop: string): string {
  // matches <meta property="og:image" content="..."> or name="..."
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i')
  const m = html.match(re)
  if (m) return m[1].trim()
  const re2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i')
  const m2 = html.match(re2)
  return m2 ? m2[1].trim() : ''
}

function extractFromHtml(html: string, baseUrl: string) {
  const title = firstMatch(/<title[^>]*>([^<]*)<\/title>/i, html)
  const metaDesc = metaContent(html, 'description') || metaContent(html, 'og:description')
  const ogTitle = metaContent(html, 'og:title')
  const cover = metaContent(html, 'og:image') || metaContent(html, 'twitter:image')

  // Logo: prefer apple-touch-icon, then icon, then og:image fallback.
  let logo = ''
  const iconRe = /<link[^>]+rel=["']([^"']*icon[^"']*)["'][^>]*>/gi
  let im: RegExpExecArray | null
  const icons: Array<{ rel: string; href: string }> = []
  while ((im = iconRe.exec(html)) !== null) {
    const tag = im[0]
    const href = firstMatch(/href=["']([^"']+)["']/i, tag)
    if (href) icons.push({ rel: im[1].toLowerCase(), href })
  }
  const apple = icons.find((i) => i.rel.includes('apple-touch'))
  const anyIcon = icons[0]
  if (apple) logo = absolutize(apple.href, baseUrl)
  else if (anyIcon) logo = absolutize(anyIcon.href, baseUrl)

  // Social links.
  const socials: Record<string, string> = {}
  const aRe = /<a\b[^>]*href=["']([^"']+)["']/gi
  let am: RegExpExecArray | null
  const platforms: Array<[string, RegExp]> = [
    ['x', /(?:twitter\.com|x\.com)\//i],
    ['linkedin', /linkedin\.com\//i],
    ['github', /github\.com\//i],
    ['youtube', /youtube\.com\/|youtu\.be\//i],
    ['instagram', /instagram\.com\//i],
    ['discord', /discord\.(?:gg|com)\//i],
  ]
  while ((am = aRe.exec(html)) !== null) {
    const href = am[1]
    for (const [key, re] of platforms) {
      if (!socials[key] && re.test(href)) socials[key] = href
    }
  }

  // JSON-LD blobs (the model can parse them).
  const ld: string[] = []
  const ldRe = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi
  let lm: RegExpExecArray | null
  while ((lm = ldRe.exec(html)) !== null && ld.length < 3) ld.push(lm[1].trim().slice(0, 3000))

  // Visible-ish text: drop scripts/styles/svg/head noise, strip tags.
  let text = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#\d+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length > 12000) text = text.slice(0, 12000)

  return { title: ogTitle || title, metaDesc, cover: absolutize(cover, baseUrl), logo, socials, ld, text }
}

async function runLLM(model: string, apiKey: string, ctx: ReturnType<typeof extractFromHtml>, url: string) {
  const system = `You extract structured product info from a website's homepage for a startup directory listing. ` +
    `Return ONLY a JSON object (no markdown) with these keys:\n` +
    `name (string, the product name), tagline (string, <=60 chars, punchy), ` +
    `description (string, 1-2 sentences, <=200 chars), longDescription (string, 2-4 sentences), ` +
    `category (string, EXACTLY one of: ${CATEGORIES.join(', ')}), ` +
    `tags (array of up to 5 short lowercase keywords), ` +
    `pricing (one of: Free, Freemium, Paid, Subscription, Unknown), ` +
    `targetAudience (string), techStack (array of strings, may be empty), ` +
    `seo ({title, description}), faq (array of up to 4 {question, answer}). ` +
    `If something is unknown, use an empty string or empty array. Do not invent facts.`
  const userMsg = `URL: ${url}\nTITLE: ${ctx.title}\nMETA DESCRIPTION: ${ctx.metaDesc}\n` +
    (ctx.ld.length ? `JSON-LD:\n${ctx.ld.join('\n---\n')}\n` : '') +
    `PAGE TEXT:\n${ctx.text}`

  const res = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://submithunt.com',
      'X-Title': 'SubmitHunt AI Prefill',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: userMsg },
      ],
      temperature: 0.2,
      max_tokens: 1100,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`AI service error (${res.status}): ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  const content = data?.choices?.[0]?.message?.content ?? ''
  // Be defensive — pull the first {...} block if the model wrapped it.
  const start = content.indexOf('{')
  const end = content.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error('AI returned no JSON.')
  return JSON.parse(content.slice(start, end + 1))
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    const apiKey = Deno.env.get('OPENROUTER_API_KEY') ?? ''
    // openrouter/auto lets OpenRouter pick the best available model for the
    // prompt; override with the OPENROUTER_MODEL secret if you want a fixed one.
    const model = Deno.env.get('OPENROUTER_MODEL') ?? 'openrouter/auto'

    // Require a signed-in user (LLM calls cost money — no anonymous abuse).
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) return json({ error: 'Please sign in to use AI prefill.' }, 401)

    if (!apiKey) return json({ error: 'AI prefill is not configured.' }, 500)

    const body = await req.json().catch(() => ({}))
    let target = String(body?.url ?? '').trim()
    if (!target) return json({ error: 'Enter your website URL.' }, 400)
    if (!/^https?:\/\//i.test(target)) target = `https://${target}`

    let parsed: URL
    try { parsed = new URL(target) } catch { return json({ error: 'That doesn\'t look like a valid URL.' }, 400) }
    if (!isPublicHost(parsed.hostname)) return json({ error: 'Enter a public website URL.' }, 400)

    let html: string
    try {
      html = await fetchPage(target)
    } catch (e) {
      const msg = (e as Error)?.name === 'AbortError' ? 'The site took too long to respond.' : ((e as Error)?.message || 'Could not reach that site.')
      return json({ error: msg }, 400)
    }

    const ctx = extractFromHtml(html, target)

    let ai: Record<string, unknown> = {}
    try {
      ai = await runLLM(model, apiKey, ctx, target)
    } catch (e) {
      // If the LLM fails, still return what we scraped directly so the form
      // gets logo/cover/socials + title/description.
      console.error('LLM prefill failed:', e)
    }

    return json({
      ok: true,
      name: ai.name || ctx.title || '',
      tagline: ai.tagline || '',
      description: ai.description || ctx.metaDesc || '',
      longDescription: ai.longDescription || '',
      category: ai.category || '',
      tags: Array.isArray(ai.tags) ? ai.tags : [],
      pricing: ai.pricing || '',
      targetAudience: ai.targetAudience || '',
      techStack: Array.isArray(ai.techStack) ? ai.techStack : [],
      seo: ai.seo || { title: ctx.title, description: ctx.metaDesc },
      faq: Array.isArray(ai.faq) ? ai.faq : [],
      // Directly scraped assets — more reliable than the LLM for these.
      logo: ctx.logo || '',
      cover: ctx.cover || '',
      socialLinks: ctx.socials,
    }, 200)
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500)
  }
})

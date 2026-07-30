import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const openrouterApiKey = Deno.env.get('OPENROUTER_API_KEY')
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { startup_id } = await req.json()

    if (!startup_id) {
      throw new Error('startup_id is required')
    }

    // Check if blog post already exists for this startup
    const { data: existingPost } = await supabase
      .from('blog_posts')
      .select('id, slug')
      .eq('startup_id', startup_id)
      .single()

    if (existingPost) {
      console.log(`Blog post already exists for startup ${startup_id}: ${existingPost.slug}`)
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Blog post already exists',
          blog_post_id: existingPost.id,
          blog_slug: existingPost.slug,
          duplicate: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch startup details
    const { data: startup, error: startupError } = await supabase
      .from('startups')
      // tags + details feed the grounding block in the prompt. Without them the
      // model has only a tagline to work from and starts inventing features.
      .select('id, title, description, tagline, url, category, slug, plan, tags, details')
      .eq('id', startup_id)
      .single()

    if (startupError || !startup) {
      throw new Error(`Failed to fetch startup: ${startupError?.message}`)
    }

    console.log(`Generating blog post for: ${startup.title}`)

    let blogContent
    let generatedBy = 'template'
    const isPaid = ['premium', 'featured', 'pro', 'lite'].includes(startup.plan)

    // Try OpenRouter generation if API key is available
    if (openrouterApiKey) {
      try {
        blogContent = await generateWithOpenRouter(startup, openrouterApiKey, isPaid)
        generatedBy = 'openrouter'
        console.log('Blog post generated with OpenRouter')
      } catch (error) {
        console.error('OpenRouter generation failed, falling back to template:', error)
        blogContent = generateWithTemplate(startup, isPaid)
      }
    } else {
      console.log('No OpenRouter API key, using template')
      blogContent = generateWithTemplate(startup, isPaid)
    }

    // Create blog post slug
    const blogSlug = `${startup.slug || slugify(startup.title)}-review`

    // Insert blog post
    const { data: blogPost, error: insertError } = await supabase
      .from('blog_posts')
      .insert({
        startup_id: startup.id,
        title: blogContent.title,
        slug: blogSlug,
        content: blogContent.content,
        excerpt: blogContent.excerpt,
        meta_description: blogContent.metaDescription,
        keywords: blogContent.keywords,
        category: startup.category || null,
        generated_by: generatedBy
      })
      .select()
      .single()

    if (insertError) {
      throw insertError
    }

    console.log(`Blog post created successfully: ${blogSlug}`)

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Blog post generated successfully',
        blog_post: blogPost,
        blog_slug: blogSlug,
        generated_by: generatedBy
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    console.error('Error generating blog post:', error)
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500
      }
    )
  }
})

// ---------------------------------------------------------------------------
// Headline generation
//
// The prompt used to list five headline formulas and tell the model to "pick
// the one that fits". It didn't spread them — it collapsed onto one. Of the 25
// most recently published posts, 18 opened with "Stop {x}. Start {y}." and 16
// never named the product at all, which is fatal for the one search term these
// posts exist to rank for: the product's own name.
//
// So the archetype is chosen HERE, not by the model, and every archetype has
// {Name} baked in. The choice is seeded off the slug so it's stable — the same
// startup regenerates to the same style — while spreading evenly across the
// corpus.
// ---------------------------------------------------------------------------

const TITLE_ARCHETYPES = [
  '{Name} review: {one specific claim a reader could verify}',
  'How {Name} {does the core job} for {specific audience}',
  '{Name}: the {category} tool for {specific audience}',
  '{Concrete outcome}, without {specific pain} — {Name}',
  'What {Name} actually does (and who should skip it)',
  'Why {specific audience} reach for {Name}',
  '{Name} for {specific audience}: {outcome in a few words}',
  'Getting started with {Name}: {first concrete win}',
]

// Small deterministic string hash (FNV-1a + an avalanche step). Not
// security-relevant — it only needs to be stable across runs so regenerating a
// post doesn't reshuffle its headline, and well-spread so archetypes don't
// clump. The final mix matters: without it, short similar slugs bucket unevenly.
function stableIndex(seed: string, buckets: number): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  h ^= h >>> 16
  h = Math.imul(h, 2246822507)
  h ^= h >>> 13
  h = Math.imul(h, 3266489909)
  h ^= h >>> 16
  return (h >>> 0) % buckets
}

function archetypeFor(startup: any): string {
  const seed = String(startup.slug || startup.title || startup.id || '')
  return TITLE_ARCHETYPES[stableIndex(seed, TITLE_ARCHETYPES.length)]
}

// Compare loosely so "ClearMail" in a headline still counts as naming
// "Clear Mail for Gmail", and punctuation/casing never causes a false miss.
function normalizeForMatch(s: string): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function truncateAtWord(text: string, max: number): string {
  const t = String(text || '').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:—-]+$/, '')
}

// The single most over-used construction on this blog: 18 of the 25 most recent
// posts. The prompt now bans it, but the previous prompt "banned" plenty and was
// ignored, so this is the binding check. Deliberately tight — it only matches
// the actual "Stop {x}. Start {y}" two-clause headline, not any innocent use of
// the words "stop" or "start".
const BANNED_TITLE_SHAPE = /^\s*stop\b[^.!?]*[.!?]\s*start\b/i

// Deterministic, clean headline from the product's own words. Used whenever the
// model's headline can't be salvaged, so the result never reads like a
// half-truncated sentence.
function fallbackTitle(startup: any): string {
  const name = String(startup.title || '').trim()
  let claim = String(startup.tagline || startup.description || '')
    .trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '')
  if (!claim) return `${name} review`

  // Taglines very often open by restating the product name ("Codemaya — AI-powered
  // software…"). Left alone that yields "Codemaya review: codemaya — AI-powered…".
  if (name && claim.toLowerCase().startsWith(name.toLowerCase())) {
    claim = claim.slice(name.length).replace(/^[\s:—–-]+/, '').replace(/^is\s+/i, '')
  }
  if (!claim) return `${name} review`

  // Lower-case the first word only when it's an ordinary word. "AI-powered",
  // "NYC" and other proper nouns / acronyms must keep their capitalisation.
  const firstWord = claim.split(' ')[0]
  const isOrdinaryWord = /^[A-Z][a-z]+$/.test(firstWord)
  const body = isOrdinaryWord ? `${claim.charAt(0).toLowerCase()}${claim.slice(1)}` : claim

  return truncateAtWord(`${name} review: ${body}`, 72)
}

// The prompt REQUESTS the product name and forbids the stock construction; this
// makes both binding. A prompt is advisory, and the evidence is that the old one
// was ignored most of the time. Repair prefers keeping the model's angle and
// prefixing the brand; it only discards the headline when that would leave a
// sentence chopped in half.
function enforceBrandInTitle(rawTitle: unknown, startup: any): string {
  const name = String(startup.title || '').trim()
  const title = String(rawTitle || '').trim().replace(/\s+/g, ' ').replace(/^["']|["']$/g, '')
  if (!name) return title
  if (!title) return fallbackTitle(startup)

  // Kill the stock shape outright, even when it does name the product —
  // "Stop wasting time. Start launching with Foo." is still the problem.
  if (BANNED_TITLE_SHAPE.test(title)) return fallbackTitle(startup)

  if (normalizeForMatch(title).includes(normalizeForMatch(name))) return title

  const merged = `${name}: ${title}`
  if (merged.length <= 72) return merged

  // Too long. Only trim if we can land on a sentence boundary — a headline cut
  // mid-clause reads worse than a clean one rebuilt from the tagline.
  const firstSentence = title.match(/^[^.!?]+[.!?]/)
  if (firstSentence) {
    const short = `${name}: ${firstSentence[0].trim().replace(/[.!?]+$/, '')}`
    if (short.length <= 72) return short
  }
  return fallbackTitle(startup)
}

async function generateWithOpenRouter(startup: any, apiKey: string, isPaid: boolean) {
  const category = startup.category || 'tech'
  // Tagline and description are DIFFERENT fields carrying different information:
  // the tagline is a 30-60 char hook, the description is the actual explanation.
  // This used to be `tagline || description`, so any startup with both sent only
  // the hook — the model got ~30 characters to write 800 words from and filled
  // the gap by inventing capabilities. Send both, always.
  const tagline = String(startup.tagline || '').trim()
  const description = String(startup.description || '').trim()
  const known = description || tagline
  const tags = Array.isArray(startup.tags) ? startup.tags.filter(Boolean) : []
  const details = (startup.details && typeof startup.details === 'object') ? startup.details : {}
  const audience = String(details.targetAudience || '').trim()
  const startupUrl = `https://submithunt.com/startup/${startup.slug || startup.id}`
  const archetype = archetypeFor(startup)

  const prompt = `Write a 700–900 word blog post about "${startup.title}" — a ${category} startup. The post must do two jobs at once: rank on Google for "${startup.title}" and ${category}-tool searches, and funnel readers to ${startup.url}.

Startup context — this is EVERYTHING we know about the product. Treat it as the
complete set of facts. Do not add capabilities, features, integrations, metrics
or use cases that are not stated here:
- Name: ${startup.title}
${tagline ? `- Tagline (their own words): ${tagline}\n` : ''}- What it does: ${known || 'Not supplied — see the instruction below.'}
- Category: ${category}
${tags.length ? `- Tags: ${tags.slice(0, 6).join(', ')}\n` : ''}${audience ? `- Who it's for: ${audience}\n` : ''}- Website: ${startup.url}
- SubmitHunt listing: ${startupUrl}
${isPaid ? '- Status: Featured/Premium listing on SubmitHunt' : ''}

GROUNDING — the most important rule here:
Write only about what the context above actually says. If it is thin, write a
SHORTER post about the little you genuinely know, describe the problem space
around it, and point the reader at the website for specifics. Never pad the
length by inventing what the product does. Guessing at features from the
category name — "analyzes customer data", "integrates with your CRM",
"real-time dashboards" — produces a post that is wrong about a real company and
is worse than no post at all. If you cannot support a sentence from the context,
delete it.

WRITING STYLE — non-negotiable:
1. Clarity over cleverness. Short sentences. Plain words. "Use" not "utilize." "Help" not "facilitate."
2. Benefits, not features. Every feature must be followed by the concrete outcome it creates for the reader.
3. Specific, not vague. BANNED words: innovative, streamline, optimize, seamless, leverage, robust, cutting-edge, revolutionary, game-changing, world-class, next-gen, unlock, empower, supercharge.
4. Active voice. No passive constructions. ("We ship reports" not "Reports are shipped".)
5. Confident, not qualified. Drop hedge words: very, really, almost, basically, just.
6. Customer language. Mirror how a ${category} buyer would actually describe their problem out loud.
7. No exclamation points anywhere. No emojis in the article body.
8. Show, don't tell. If you'd write "fast," replace with the time saved. If you'd write "easy," describe the steps it removes.
9. Honest. Do not fabricate stats, testimonials, user counts, funding numbers, or company history. If you don't know it, don't claim it.

HEADLINE — hard requirements, read twice:
1. The headline MUST contain the product name exactly as written: ${startup.title}
   A headline that does not name the product is a failed headline, because the
   main search term this post exists to rank for is the product's own name.
2. Use THIS shape and no other. It has been assigned to this post specifically
   so that our blog doesn't end up with hundreds of identically-worded titles:

   ${archetype}

   Replace every {placeholder} with something concrete and specific to
   ${startup.title}. Keep the shape; do not substitute a different formula.
3. Max 65 characters including the product name. Count them.
4. BANNED headline patterns — these are overused on this blog and must not
   appear in any form:
   - "Stop {anything}. Start {anything}." — do not use this construction at all.
   - "Best [X] in {year}", "Ultimate Guide to…", "Top 10…", "The Future of…"
   - Any headline that would still make sense for a different product. If you
     could swap in a competitor's name without editing anything else, it is too
     generic — rewrite it around what ${startup.title} specifically does.
5. No exclamation points, no clickbait, no unverifiable superlatives.

STRUCTURE — one idea per section, logical flow from pain to action:
${isPaid ? '- Open with a one-line "Editor\'s Pick" callout (italic <p><em>…</em></p>), then the hook below.\n' : ''}- Hook (1 short paragraph): a rhetorical question OR a sharp pain-point statement a ${category} reader would nod at. No "In today's world…" intros.
- <h2> The problem this solves: 1–2 paragraphs naming the specific pain in ${category} workflows. Use concrete examples a buyer would recognize.
- <h2> What ${startup.title} does: factual description in 1–2 paragraphs. Lead with the outcome it produces, then the mechanism. Link the brand name to ${startup.url} on first mention.
- <h2> What you get out of it: 3–5 bullet points, each starting with a <strong>concrete benefit</strong> and ending with the user-side outcome. Pattern: "<strong>{Outcome}.</strong> {How it works in one sentence.}"
- <h2> Who it's for (and who it isn't): 1 short paragraph for each. Name the role/team. Saying who it isn't for builds trust.
- <h2> Getting started: 2–4 sentences on the first action. Link ${startup.url} again here as the primary CTA. Mention the SubmitHunt listing (${startupUrl}) once for community context.
- <h2> Bottom line: 1 paragraph that recaps the single most useful thing about ${startup.title} and tells the reader exactly what to do next.

CTA RULES — every link to ${startup.url} should use action-led anchor text. GOOD: "Try ${startup.title}", "See ${startup.title} in action", "Get started with ${startup.title}". BAD: "click here", "learn more", "visit website", "sign up".

SEO RULES:
- Use ${startup.title} naturally in the H1, the first paragraph, one H2, and the closing paragraph. Do not keyword-stuff.
- Long-tail terms to weave in once each, only where they fit naturally: "${startup.title} review", "best ${category} tools", "${category} software for founders".
- Headings should match what a buyer would type into Google — not internal jargon.

OUTPUT — respond with valid JSON only. No markdown fences, no commentary outside the JSON.
{
  "title": "Single headline following the assigned shape above, max 65 chars, MUST contain \\"${startup.title}\\", no exclamation point",
  "content": "Full HTML article. Allowed tags only: <h2>, <h3>, <p>, <ul>, <li>, <strong>, <em>, <a>. No inline styles. No <h1> (the page renders that). 700–900 words.",
  "excerpt": "One sentence, max 160 chars, that sells the article without using any banned word above",
  "metaDescription": "SEO meta description, max 160 chars, primary keyword in the first 60 chars",
  "keywords": ["5–7 specific long-tail keywords, lowercase, no duplicates"]
}`

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://submithunt.com',
      'X-Title': 'SubmitHunt Blog Generator'
    },
    body: JSON.stringify({
      model: 'openai/gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You are a senior conversion copywriter who writes product-focused blog posts that rank on Google AND convert readers into trial users. You follow these rules without exception: clarity over cleverness, benefits over features, specific over vague, active over passive, confident over qualified, honest over sensational. You never invent statistics, testimonials, or facts about a product. You never use the words "innovative", "streamline", "optimize", "seamless", "leverage", "robust", "revolutionary", "game-changing", or "unlock". You never use exclamation points.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.55,
      max_tokens: 2500
    })
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenRouter API error: ${error}`)
  }

  const result = await response.json()
  const content = result.choices[0].message.content

  // Parse JSON response
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    throw new Error('Failed to parse OpenRouter response')
  }

  const parsed = JSON.parse(jsonMatch[0])
  const finalTitle = enforceBrandInTitle(parsed.title, startup)
  if (finalTitle !== parsed.title) {
    console.log(`Title repaired (model omitted the product name): ${JSON.stringify(parsed.title)} -> ${JSON.stringify(finalTitle)}`)
  }
  return { ...parsed, title: finalTitle }
}

function generateWithTemplate(startup: any, isPaid: boolean) {
  const category = startup.category || 'tech'
  // The headline wants the short hook; the body wants the fuller explanation.
  // Picking one for both is what starved the model path of context.
  const hook = String(startup.tagline || '').trim()
  const description = String(startup.description || '').trim() || hook || `a ${category} tool for modern teams`
  const startupUrl = `https://submithunt.com/startup/${startup.slug || startup.id}`

  // The template path runs when OpenRouter is unavailable. It used to emit one
  // fixed headline for every startup ("... Is This the Best X Tool in 2025?"),
  // which is both the pattern the prompt bans and a guaranteed duplicate. Vary
  // it off the same stable seed the model path uses, so fallbacks don't cluster
  // either. Every variant names the product.
  const shortClaim = truncateAtWord(
    String(hook || description).replace(/\s+/g, ' ').replace(/[.!?]+$/, ''),
    Math.max(18, 60 - startup.title.length),
  )
  const prettyCategory = category.charAt(0).toUpperCase() + category.slice(1)
  const titleVariants = [
    `${startup.title} review: ${shortClaim || `a closer look at this ${category} tool`}`,
    `What ${startup.title} does, and who it's for`,
    `${startup.title}: the ${prettyCategory} tool worth a look`,
    `How ${startup.title} fits into a ${category} workflow`,
    `${startup.title} explained in two minutes`,
    `Why builders are trying ${startup.title}`,
    `${startup.title} for teams working in ${category}`,
    `Getting started with ${startup.title}`,
  ]
  const title = truncateAtWord(
    titleVariants[stableIndex(String(startup.slug || startup.title || startup.id || ''), titleVariants.length)],
    72,
  )

  const content = `
<article>
  ${isPaid ? `<div style="background:#fef9c3;border-left:4px solid #f59e0b;padding:16px 20px;margin-bottom:28px;border-radius:6px;"><strong>⭐ Editor's Pick</strong> — ${startup.title} is a featured startup on SubmitHunt.</div>` : ''}

  <h2>The Problem Every ${category.charAt(0).toUpperCase() + category.slice(1)} Team Faces</h2>
  <p>Most ${category} tools make big promises and deliver mediocre results. They're built for demos, not real work. <strong>${startup.title}</strong> was built to fix that.</p>

  <h2>What Is ${startup.title}?</h2>
  <p>${description}. ${isPaid ? 'As a featured listing on' : 'Now live on'} <a href="https://submithunt.com">SubmitHunt</a>, it's gaining traction fast among founders and builders in the ${category} space.</p>

  <h2>What You Actually Get</h2>
  <ul>
    <li><strong>Speed:</strong> Get up and running without a lengthy setup process — your team ships faster from day one.</li>
    <li><strong>Focus:</strong> Built around the core job-to-be-done in ${category}, not bloated with features you'll never use.</li>
    <li><strong>Results:</strong> Early users report measurable improvements in their ${category} workflows within the first week.</li>
  </ul>

  <h2>Who Is ${startup.title} For?</h2>
  <p>If you're a founder, indie developer, or small team working in the ${category} space and tired of paying for tools that don't move the needle — ${startup.title} is worth a serious look.</p>

  <h2>How to Get Started</h2>
  <p>Visit <a href="${startup.url}" target="_blank" rel="noopener">${startup.title}'s website</a> and sign up. It takes minutes. You can also browse their <a href="${startupUrl}">SubmitHunt listing</a> to see community upvotes and feedback.</p>

  <h2>The Bottom Line</h2>
  <p>${startup.title} is a focused, no-nonsense ${category} tool that solves a real problem. Discover more launches like this on <a href="https://submithunt.com">SubmitHunt</a> — where the best new startups go live every week.</p>
</article>`

  const excerpt = `${startup.title} is a ${category} tool that ${description.toLowerCase().replace(/\.$/, '')}. Here's what makes it worth your attention.`

  const metaDescription = `${startup.title} review: ${description} — discovered on SubmitHunt. See what it does, who it's for, and how to get started.`

  const keywords = [
    startup.title.toLowerCase(),
    `${startup.title.toLowerCase()} review`,
    `best ${category} tools`,
    `${category} software`,
    'submithunt',
    'new startup tools',
    `${category} startup`
  ].filter(Boolean).slice(0, 7)

  return {
    title,
    content,
    excerpt,
    metaDescription,
    keywords
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

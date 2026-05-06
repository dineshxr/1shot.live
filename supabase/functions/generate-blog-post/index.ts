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
      .select('id, title, description, tagline, url, category, slug, plan')
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

async function generateWithOpenRouter(startup: any, apiKey: string, isPaid: boolean) {
  const category = startup.category || 'tech'
  const description = startup.tagline || startup.description || ''
  const startupUrl = `https://submithunt.com/startup/${startup.slug || startup.id}`

  const prompt = `Write a 700–900 word blog post about "${startup.title}" — a ${category} startup. The post must do two jobs at once: rank on Google for "${startup.title}" and ${category}-tool searches, and funnel readers to ${startup.url}.

Startup context:
- Name: ${startup.title}
- What it does: ${description || 'A new ' + category + ' tool'}
- Category: ${category}
- Website: ${startup.url}
- SubmitHunt listing: ${startupUrl}
${isPaid ? '- Status: Featured/Premium listing on SubmitHunt' : ''}

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

HEADLINE — pick the formula that fits, then write a single headline (max 65 characters):
- "{Outcome} without {pain point}"
- "The ${category} ${startup.title.includes(' ') ? 'tool' : 'app'} for {specific audience}"
- "Stop {painful action}. Start {outcome}."
- "${startup.title} review: {specific claim a reader can verify}"
- A sharp question that names the reader's pain in the ${category} space.
Avoid: "Best [X] in 2025", "Ultimate Guide to…", "Top 10…", clickbait.

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
  "title": "Single headline, max 65 chars, no exclamation point",
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

  return JSON.parse(jsonMatch[0])
}

function generateWithTemplate(startup: any, isPaid: boolean) {
  const category = startup.category || 'tech'
  const description = startup.tagline || startup.description || `a ${category} tool for modern teams`
  const startupUrl = `https://submithunt.com/startup/${startup.slug || startup.id}`

  const title = `${startup.title} Review: Is This the Best ${category.charAt(0).toUpperCase() + category.slice(1)} Tool in 2025?`

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
    'startup tools 2025',
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

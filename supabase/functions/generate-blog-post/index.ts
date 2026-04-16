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

  const prompt = `You are an expert conversion copywriter and SEO strategist. Write a compelling, high-ranking blog post about "${startup.title}" — a ${category} startup.

Startup context:
- Name: ${startup.title}
- What it does: ${description || 'A new ' + category + ' tool'}
- Category: ${category}
- Website: ${startup.url}
- SubmitHunt listing: ${startupUrl}
${isPaid ? '- Status: Featured/Premium listing on SubmitHunt' : ''}

Copywriting rules you MUST follow:
1. Open with a hook — a sharp question or bold statement that calls out the reader's specific pain point in the ${category} space. No generic intros.
2. Benefits over features — every feature mentioned must be followed by the outcome it creates for the user.
3. Be specific, never vague — avoid words like "innovative", "streamline", "optimize". Describe real results.
4. Use active voice throughout. No passive constructions.
5. Write like a sharp product journalist, not a press release.
6. One idea per section — build a logical argument from pain → solution → proof → action.
7. Include a strong, specific CTA at the end that tells the reader exactly what to do and why now.

SEO rules:
- Naturally include long-tail keywords for "${startup.title}", "${category} tools", "best ${category} software"
- Use H2 and H3 headings that a reader would actually search for
- Link to ${startup.url} (as the primary CTA) and https://submithunt.com (as context for discovery)
- Target 700-900 words

${isPaid ? 'Since this is a featured listing, open with a brief "Editor\'s Pick" callout before the main content.' : ''}

Respond ONLY with valid JSON — no markdown fences, no extra text:
{
  "title": "Punchy, SEO-rich headline (max 65 chars)",
  "content": "Full HTML article with <h2>, <h3>, <p>, <ul>, <li>, <strong> tags. No inline styles. Min 700 words.",
  "excerpt": "One punchy sentence (max 160 chars) that sells the article",
  "metaDescription": "SEO meta description (max 160 chars) with primary keyword near the front",
  "keywords": ["5 to 7 specific long-tail keywords as an array"]
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
          content: 'You are an expert conversion copywriter and SEO content strategist. You write product-focused blog posts that rank on Google and convert readers into users. Your writing is direct, specific, and benefit-driven. You never use filler phrases, passive voice, or vague superlatives.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.65,
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

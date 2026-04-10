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
    const openrouterApiKey = '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'
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    const { startup_id } = await req.json()

    if (!startup_id) {
      throw new Error('startup_id is required')
    }

    // Check if blog post already exists for this startup
    const { data: existingPost } = await supabase
      .from('blog_posts')
      .select('id')
      .eq('startup_id', startup_id)
      .single()

    if (existingPost) {
      console.log(`Blog post already exists for startup ${startup_id}`)
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Blog post already exists',
          blog_post_id: existingPost.id,
          duplicate: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch startup details
    const { data: startup, error: startupError } = await supabase
      .from('startups')
      .select('id, title, description, tagline, url, category, slug')
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
  const featuredBadge = isPaid ? ' [FEATURED]' : ''
  const prompt = `Write an SEO-optimized blog post (600-900 words) reviewing "${startup.title}"${featuredBadge}.

Startup Details:
- Title: ${startup.title}
- Description: ${startup.description || startup.tagline || 'No description provided'}
- Category: ${startup.category || 'General'}
- URL: ${startup.url}
- Plan: ${isPaid ? 'Premium/Featured' : 'Free'}

Requirements:
1. Write in a professional, engaging tone
2. Include SEO keywords naturally
3. Structure with clear headings (H2, H3)
4. Mention that this startup is ${isPaid ? 'featured' : 'listed'} on SubmitHunt
${isPaid ? '5. Add a "Featured Startup" badge/section highlighting this is a premium listing' : '5. Focus on the innovative aspects of this startup'}
6. Include a call-to-action to visit the startup
7. Link to SubmitHunt homepage (https://submithunt.com) and the startup's detail page
8. Focus on benefits and use cases
9. Make it informative and valuable to readers

Format the response as JSON with these fields:
{
  "title": "SEO-friendly blog post title",
  "content": "Full HTML content with proper headings and paragraphs",
  "excerpt": "150-character summary",
  "metaDescription": "160-character meta description",
  "keywords": ["keyword1", "keyword2", "keyword3", "keyword4", "keyword5"]
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
          content: 'You are an expert SEO content writer specializing in startup and product reviews. Write engaging, informative content that ranks well in search engines.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 2000
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
  const title = `${startup.title} Review: ${startup.tagline || 'A Comprehensive Look at This Innovative Tool'}`
  const startupUrl = `https://submithunt.com/startup/${startup.slug || startup.id}`
  const featuredBadge = isPaid ? '<span style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: bold; text-transform: uppercase; margin-left: 10px;">Featured</span>' : ''
  
  const content = `
<article class="blog-post">
  ${isPaid ? `
  <div style="background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%); border-left: 4px solid #f59e0b; padding: 20px; margin-bottom: 30px; border-radius: 8px;">
    <p style="margin: 0; color: #92400e; font-weight: bold; font-size: 16px;">
      ⭐ Featured Startup - This is a premium listing on SubmitHunt
    </p>
  </div>
  ` : ''}
  
  <h2>Introduction to ${startup.title}${featuredBadge}</h2>
  <p>
    ${startup.title} is an innovative ${startup.category || 'tool'} that's making waves in the startup community. 
    ${isPaid ? 'As a featured startup' : 'Recently listed'} on <a href="https://submithunt.com">SubmitHunt</a>, this platform has caught the attention 
    of founders and early adopters looking for cutting-edge solutions.
  </p>
  
  <p>
    ${startup.description || startup.tagline || `${startup.title} offers a unique approach to solving common challenges in the ${startup.category || 'tech'} space.`}
  </p>

  <h2>Key Features and Benefits</h2>
  <p>
    What sets ${startup.title} apart is its focus on delivering real value to users. The platform combines 
    intuitive design with powerful functionality, making it accessible to both beginners and experienced users.
  </p>

  <h3>Why Choose ${startup.title}?</h3>
  <ul>
    <li><strong>User-Friendly Interface:</strong> Easy to navigate and get started quickly</li>
    <li><strong>Innovative Approach:</strong> Fresh perspective on solving industry challenges</li>
    <li><strong>Active Development:</strong> Regular updates and improvements based on user feedback</li>
    <li><strong>Community Support:</strong> Growing community of users and advocates</li>
  </ul>

  <h2>Use Cases and Applications</h2>
  <p>
    ${startup.title} is particularly useful for professionals and teams looking to streamline their workflow 
    and improve productivity. Whether you're a solo entrepreneur or part of a larger organization, this tool 
    can help you achieve your goals more efficiently.
  </p>

  <h3>Who Should Use ${startup.title}?</h3>
  <p>
    This platform is ideal for:
  </p>
  <ul>
    <li>Startups and small businesses looking to optimize operations</li>
    <li>Freelancers seeking to improve their productivity</li>
    <li>Teams wanting to collaborate more effectively</li>
    <li>Anyone interested in innovative ${startup.category || 'tech'} solutions</li>
  </ul>

  <h2>Getting Started with ${startup.title}</h2>
  <p>
    Ready to explore what ${startup.title} has to offer? Visit their 
    <a href="${startup.url}" target="_blank" rel="noopener">official website</a> to learn more and get started. 
    You can also check out their <a href="${startupUrl}">detailed listing on SubmitHunt</a> to see what other 
    users are saying and stay updated on the latest developments.
  </p>

  <h2>Final Thoughts</h2>
  <p>
    ${startup.title} represents the kind of innovation we love to see in the startup ecosystem. By focusing on 
    user needs and delivering practical solutions, it's building a strong foundation for long-term success.
  </p>

  <p>
    Discover more innovative startups like ${startup.title} on 
    <a href="https://submithunt.com">SubmitHunt</a>, where founders launch and get discovered every day.
  </p>

  <div class="cta-box" style="background: #f8f9fa; padding: 20px; border-left: 4px solid #60a5fa; margin: 30px 0;">
    <h3 style="margin-top: 0;">Try ${startup.title} Today</h3>
    <p>
      Experience the benefits firsthand by visiting <a href="${startup.url}" target="_blank" rel="noopener">${startup.title}</a> 
      and exploring all the features this innovative platform has to offer.
    </p>
  </div>
</article>
  `

  const excerpt = `Discover ${startup.title}, an innovative ${startup.category || 'tool'} featured on SubmitHunt. Learn about its key features, benefits, and how it can help you achieve your goals.`

  const metaDescription = `${startup.title} review: Explore this innovative ${startup.category || 'tool'} featured on SubmitHunt. Learn about features, benefits, and use cases in this comprehensive guide.`

  const keywords = [
    startup.title.toLowerCase(),
    `${startup.title.toLowerCase()} review`,
    startup.category?.toLowerCase() || 'startup tool',
    'submithunt',
    'innovative tools',
    'startup launch',
    'productivity tools'
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

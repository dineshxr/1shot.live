import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Create Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get startup ID and optional payment date from request body
    const { startupId, paymentDate } = await req.json()
    
    if (!startupId) {
      return new Response(
        JSON.stringify({ error: 'startupId is required' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      )
    }

    // Use provided payment date or default to today in PST
    const launchDate = paymentDate || new Date().toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
    console.log(`Publishing paid startup: ${startupId} with launch date (PST): ${launchDate}`)

    // Get the startup details
    const { data: startup, error: startupError } = await supabase
      .from('startups')
      .select('id, title, slug, description, plan, author, launch_date, is_live, payment_status')
      .eq('id', startupId)
      .single()

    if (startupError || !startup) {
      console.error('Startup not found:', startupError)
      return new Response(
        JSON.stringify({ error: 'Startup not found' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404
        }
      )
    }

    // Check if it's already live
    if (startup.is_live) {
      console.log(`Startup ${startup.title} is already live`)
      return new Response(
        JSON.stringify({
          message: 'Startup is already live',
          startup: startup
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200
        }
      )
    }

    // Check if it's a paid startup
    const paidPlans = ['premium', 'featured', 'pro', 'lite']
    if (!paidPlans.includes(startup.plan)) {
      console.log(`Startup ${startup.title} is not a paid plan (plan: ${startup.plan})`)
      return new Response(
        JSON.stringify({ error: 'Only paid startups can be published immediately' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400
        }
      )
    }

    // Defense in depth: never publish a paid-plan row whose payment hasn't
    // been confirmed by the Stripe webhook, even if this function is invoked
    // outside its normal call site.
    if (startup.payment_status !== 'paid') {
      console.log(`Refusing to publish ${startup.title} — payment_status=${startup.payment_status}`)
      return new Response(
        JSON.stringify({ error: 'Payment not confirmed for this startup' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 402 // Payment Required
        }
      )
    }

    // Update startup to live immediately
    const { error: updateError } = await supabase
      .from('startups')
      .update({ 
        is_live: true,
        launch_date: launchDate, // Use payment date instead of today
        notification_sent: false, // Reset so notification gets sent
        notification_sent_at: null
      })
      .eq('id', startupId)

    if (updateError) {
      console.error('Error updating startup:', updateError)
      throw updateError
    }

    console.log(`Successfully published startup: ${startup.title}`)

    // Generate blog post FIRST (blocking) so we can include the link in the email
    const blogSlug = await generateBlogPost(startupId)
    const blogUrl = blogSlug ? `https://submithunt.com/blog/${blogSlug}` : null
    if (blogSlug) {
      console.log(`Blog post ready for ${startup.title}: ${blogUrl}`)
    } else {
      console.log(`Blog post generation failed for ${startup.title}`)
    }

    // Send live notification with blog URL
    const emailSent = await sendLiveNotification({
      ...startup,
      author_email: startup.author?.email,
      author_name: startup.author?.name,
    }, blogUrl)

    // Update notification status
    await supabase
      .from('startups')
      .update({
        notification_sent: emailSent,
        notification_sent_at: new Date().toISOString()
      })
      .eq('id', startupId)

    return new Response(
      JSON.stringify({ 
        message: 'Startup published successfully',
        startup: {
          ...startup,
          is_live: true,
          launch_date: launchDate
        },
        blogUrl,
        emailSent
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Function error:', error)
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    )
  }
})

async function generateBlogPost(startupId: string): Promise<string | null> {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    
    const response = await fetch(`${supabaseUrl}/functions/v1/generate-blog-post`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ startup_id: startupId })
    })

    if (!response.ok) {
      const error = await response.text()
      console.error(`Blog generation failed: ${error}`)
      return null
    }

    const result = await response.json()
    const slug = result.blog_slug || result.blog_post?.slug || null
    console.log(`Blog post result for ${startupId}: slug=${slug}, duplicate=${result.duplicate}`)
    return slug
  } catch (error) {
    console.error('Error generating blog post:', error)
    return null
  }
}

async function sendLiveNotification(listing: any, blogUrl: string | null = null): Promise<boolean> {
  try {
    // Use Resend API for sending emails
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    
    if (!resendApiKey) {
      console.log('No Resend API key found, skipping email')
      return false
    }

    const startupUrl = `https://submithunt.com/startup/${listing.slug || listing.id}`;
    const isPaidPlan = ['premium', 'featured', 'pro', 'lite'].includes(listing.plan);
    const shareText = encodeURIComponent(`I just launched ${listing.title} on @SubmitHunt! Check it out and give it an upvote 🚀`);

    const emailData = {
      from: 'SubmitHunt <hello@submithunt.com>',
      to: [listing.author_email],
      subject: `${listing.title} is live — here's how to maximize your launch`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${listing.title} is Live on SubmitHunt</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; margin-top: 20px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
    
    <!-- Header -->
    <div style="background-color: #60a5fa; padding: 30px; text-align: center; border-bottom: 4px solid #000;">
      <h1 style="margin: 0; color: #000; font-size: 26px; font-weight: bold;">${listing.title} is LIVE</h1>
      <p style="margin: 8px 0 0 0; color: #1a1a1a; font-size: 15px;">Your listing is now visible to thousands of founders and early adopters</p>
    </div>
    
    <!-- Main Content -->
    <div style="padding: 30px;">
      <p style="font-size: 16px; color: #333; margin-bottom: 20px; line-height: 1.6;">
        Hey ${listing.author_name || 'there'},
      </p>
      
      <p style="font-size: 16px; color: #555; line-height: 1.6; margin-bottom: 0;">
        <strong>${listing.title}</strong> just went live on SubmitHunt. Your product page is ready:
      </p>
      
      <!-- Startup Card -->
      <div style="background-color: #f8f9fa; border: 2px solid #e9ecef; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <h2 style="margin: 0 0 8px 0; color: #333; font-size: 20px;">${listing.title}</h2>
        <p style="margin: 0 0 15px 0; color: #666; font-size: 14px; line-height: 1.5;">${listing.description?.substring(0, 150) || ''}${listing.description?.length > 150 ? '...' : ''}</p>
        <a href="${startupUrl}" style="display: inline-block; background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">View Your Listing</a>
      </div>
      
      <!-- Share & Get Votes -->
      <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 0 8px 8px 0; padding: 20px; margin: 25px 0;">
        <h3 style="margin: 0 0 8px 0; color: #92400e; font-size: 16px;">The #1 thing that separates top launches</h3>
        <p style="margin: 0 0 12px 0; color: #78350f; font-size: 14px; line-height: 1.6;">
          Products that reach the Top 3 on launch day all have one thing in common: their founders shared the listing within the first few hours. The earlier you share, the more momentum you build.
        </p>
        <p style="margin: 0 0 15px 0; color: #92400e; font-size: 14px; font-weight: bold;">
          Top 3 products earn a permanent badge + a dofollow backlink from our 37+ DR site.
        </p>
        <a href="https://twitter.com/intent/tweet?text=${shareText}&url=${encodeURIComponent(startupUrl)}" style="display: inline-block; background-color: #000; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">Share on X</a>
      </div>
      
      ${!isPaidPlan ? `
      <!-- Upsell for Free Users -->
      <div style="background: #1a1a1a; border-radius: 8px; padding: 28px; margin: 25px 0;">
        <p style="margin: 0 0 6px 0; color: #f59e0b; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">For ${listing.title}</p>
        <h3 style="margin: 0 0 12px 0; color: #fff; font-size: 22px; line-height: 1.3;">Get a guaranteed dofollow backlink for $20</h3>
        <p style="margin: 0 0 20px 0; color: #ccc; font-size: 14px; line-height: 1.6;">
          Most founders pay $50-200 for a single backlink from a DR 37+ site. With a Premium upgrade, you get one automatically &mdash; plus your listing stays on the homepage for 14 days instead of 7.
        </p>
        
        <table style="width: 100%; margin-bottom: 20px;" cellpadding="0" cellspacing="0">
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #333;">
              <table cellpadding="0" cellspacing="0"><tr>
                <td style="color: #22c55e; font-size: 16px; padding-right: 10px; vertical-align: top;">&#10003;</td>
                <td style="color: #e5e5e5; font-size: 14px;">Permanent dofollow backlink (37+ DR)</td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #333;">
              <table cellpadding="0" cellspacing="0"><tr>
                <td style="color: #22c55e; font-size: 16px; padding-right: 10px; vertical-align: top;">&#10003;</td>
                <td style="color: #e5e5e5; font-size: 14px;">14 days on homepage (vs 7 for free)</td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0; border-bottom: 1px solid #333;">
              <table cellpadding="0" cellspacing="0"><tr>
                <td style="color: #22c55e; font-size: 16px; padding-right: 10px; vertical-align: top;">&#10003;</td>
                <td style="color: #e5e5e5; font-size: 14px;">Featured in newsletter (2,000+ subscribers)</td>
              </tr></table>
            </td>
          </tr>
          <tr>
            <td style="padding: 8px 0;">
              <table cellpadding="0" cellspacing="0"><tr>
                <td style="color: #22c55e; font-size: 16px; padding-right: 10px; vertical-align: top;">&#10003;</td>
                <td style="color: #e5e5e5; font-size: 14px;">Skip the queue on future launches</td>
              </tr></table>
            </td>
          </tr>
        </table>
        
        <div style="text-align: center;">
          <a href="https://submithunt.com/pricing" style="display: inline-block; background-color: #f59e0b; color: #000; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px;">Upgrade to Premium &mdash; $20</a>
        </div>
        <p style="margin: 12px 0 0 0; color: #888; font-size: 12px; text-align: center;">One-time payment. No subscription.</p>
      </div>
      ` : `
      <!-- Paid Plan Thank You -->
      <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 8px; padding: 25px; margin: 25px 0;">
        <h3 style="margin: 0 0 10px 0; color: #fff; font-size: 18px;">Your Premium benefits are active</h3>
        <p style="margin: 0; color: #fff; font-size: 14px; line-height: 1.6; opacity: 0.95;">
          Your listing has priority placement and extended homepage visibility. Your dofollow backlink (37+ DR) will be live within 24 hours. We'll also feature ${listing.title} in our next newsletter to 2,000+ subscribers.
        </p>
      </div>
      `}
      
      ${blogUrl ? `
      <!-- Blog Post Link -->
      <div style="background-color: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <h3 style="margin: 0 0 8px 0; color: #166534; font-size: 16px;">Your dedicated blog post is live</h3>
        <p style="margin: 0 0 12px 0; color: #15803d; font-size: 14px; line-height: 1.5;">We've published an SEO-optimized blog post about ${listing.title} to drive extra organic traffic to your listing.</p>
        <a href="${blogUrl}" style="display: inline-block; background-color: #16a34a; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">Read your blog post &rarr;</a>
      </div>
      ` : ''}
      
      <!-- Launch Day Checklist -->
      <div style="margin-top: 28px; padding-top: 20px; border-top: 1px solid #e9ecef;">
        <h4 style="margin: 0 0 15px 0; color: #333; font-size: 16px;">Your launch day checklist:</h4>
        <table style="width: 100%;" cellpadding="0" cellspacing="0">
          <tr><td style="padding: 6px 0; color: #555; font-size: 14px;">&#9744; Share on X and tag <strong>@SubmitHunt</strong> (we'll repost)</td></tr>
          <tr><td style="padding: 6px 0; color: #555; font-size: 14px;">&#9744; Post in relevant communities (Reddit, Indie Hackers, LinkedIn)</td></tr>
          <tr><td style="padding: 6px 0; color: #555; font-size: 14px;">&#9744; Ask 5 friends to upvote in the first hour</td></tr>
          <tr><td style="padding: 6px 0; color: #555; font-size: 14px;">&#9744; Reply to any comments on your listing</td></tr>
        </table>
      </div>
    </div>
    
    <!-- Footer -->
    <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
      <p style="margin: 0 0 8px 0; color: #666; font-size: 14px;">
        Good luck with your launch.
      </p>
      <p style="margin: 0; color: #999; font-size: 12px;">
        <a href="https://submithunt.com" style="color: #60a5fa; text-decoration: none;">SubmitHunt</a> &mdash; Where founders launch and get discovered
      </p>
    </div>
  </div>
</body>
</html>
      `,
      text: `${listing.title} is live on SubmitHunt

Hey ${listing.author_name || 'there'},

${listing.title} just went live on SubmitHunt. Your product page is ready:
${startupUrl}

THE #1 THING THAT SEPARATES TOP LAUNCHES
Products that reach the Top 3 on launch day all have one thing in common: their founders shared the listing within the first few hours.

Top 3 products earn a permanent badge + a dofollow backlink from our 37+ DR site.

Share on X: https://twitter.com/intent/tweet?text=${shareText}&url=${encodeURIComponent(startupUrl)}

${!isPaidPlan ? `GET A GUARANTEED BACKLINK FOR $20
Most founders pay $50-200 for a single backlink from a DR 37+ site. With a Premium upgrade, you get one automatically -- plus your listing stays on the homepage for 14 days instead of 7.

- Permanent dofollow backlink (37+ DR)
- 14 days on homepage (vs 7 for free)
- Featured in newsletter (2,000+ subscribers)
- Skip the queue on future launches

Upgrade: https://submithunt.com/pricing
One-time payment. No subscription.
` : `YOUR PREMIUM BENEFITS ARE ACTIVE
Your listing has priority placement and extended homepage visibility. Your dofollow backlink (37+ DR) will be live within 24 hours.
`}

${blogUrl ? `YOUR BLOG POST IS LIVE
We've published an SEO-optimized blog post to help drive traffic to your listing:
${blogUrl}

` : ''}LAUNCH DAY CHECKLIST:
- Share on X and tag @SubmitHunt (we'll repost)
- Post in relevant communities (Reddit, Indie Hackers, LinkedIn)
- Ask 5 friends to upvote in the first hour
- Reply to any comments on your listing

Good luck with your launch.
The SubmitHunt Team
      `
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(emailData),
    })

    if (!response.ok) {
      const errorData = await response.text()
      console.error('Resend API error:', errorData)
      return false
    }

    const result = await response.json()
    console.log('Email sent successfully:', result)
    return true

  } catch (error) {
    console.error('Error sending email:', error)
    return false
  }
}

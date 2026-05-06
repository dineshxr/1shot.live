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

    // Get current time in PST - ensure consistent timezone handling
    const now = new Date()
    const pstTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Los_Angeles"}))
    const currentHour = pstTime.getHours()
    
    // Get PST date string for consistent date comparison
    const todayPst = pstTime.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' }) // YYYY-MM-DD format
    
    console.log(`Current PST time: ${pstTime.toISOString()}, Hour: ${currentHour}, Date: ${todayPst}`)
    const { data: startupsToGoLive, error: startupsError } = await supabase
      .from('startups')
      .select('id, title, slug, description, plan, author, launch_date')
      .eq('is_live', false)
      .eq('archived', false)
      .or(`launch_date.lte.${todayPst},plan.in.(premium,featured)`)
      .order('plan', { ascending: false }) // Premium/featured first
      .order('launch_date', { ascending: true })

    if (startupsError) {
      console.error('Error fetching startups to go live:', startupsError)
      throw startupsError
    }

    const listings = (startupsToGoLive || [])
      .filter((s: any) => {
        // Paid startups (premium/featured) should go live immediately regardless of launch_date or time
        if (s.plan === 'premium' || s.plan === 'featured') {
          console.log(`Processing paid startup: ${s.title} (${s.plan})`)
          return true
        }
        
        // For free startups, check if it's past 8 AM PST
        if (currentHour < 8) {
          console.log(`Skipping free startup ${s.title} - too early (${currentHour} PST < 8 AM PST)`)
          return false
        }
        
        // For free startups, only process if launch_date is not null and is a weekday
        if (!s.launch_date) {
          return false
        }
        
        // Parse the launch_date to check if it's a weekday
        // launch_date is in YYYY-MM-DD format
        const [year, month, day] = s.launch_date.split('-').map(Number)
        // Create date using UTC to avoid timezone shifting the day of week
        // (using local midnight on a UTC server would shift back a day when converted to PST)
        const date = new Date(Date.UTC(year, month - 1, day))
        const dow = date.getUTCDay() // 0=Sunday, 1=Monday, ..., 6=Saturday
        
        // Monday=1, Tuesday=2, ..., Friday=5 are weekdays
        const isWeekday = dow >= 1 && dow <= 5
        
        console.log(`Free startup ${s.title}: launch_date=${s.launch_date}, dow=${dow}, isWeekday=${isWeekday}`)
        return isWeekday
      })
      .map((s: any) => ({
        ...s,
        author_email: s.author?.email,
        author_name: s.author?.name,
      }))

    console.log(`Found ${listings?.length || 0} listings to go live`)

    // Process each new listing: mark live + send email
    const results = []
    for (let i = 0; i < listings.length; i++) {
      const listing = listings[i]
      try {
        const { error: markLiveError } = await supabase
          .from('startups')
          .update({ is_live: true })
          .eq('id', listing.id)

        if (markLiveError) {
          throw markLiveError
        }

        // Compute blog URL deterministically (no API call needed - same formula as generate-blog-post)
        const blogUrl = `https://submithunt.com/blog/${listing.slug || slugify(listing.title)}-review`
        console.log(`Blog URL for ${listing.title}: ${blogUrl}`)

        // Trigger blog generation non-blocking (HTTP call completes independently in its own edge function context)
        triggerBlogGeneration(listing.id)

        // Send email notification with blog URL
        const emailSent = await sendLiveNotification(listing, blogUrl)

        // Only mark notification as sent if email was actually delivered
        if (emailSent) {
          await supabase
            .from('startups')
            .update({
              notification_sent: true,
              notification_sent_at: new Date().toISOString()
            })
            .eq('id', listing.id)
        } else {
          console.log(`Email not sent for ${listing.title} (no email or send failed) - leaving notification_sent = false`)
        }

        results.push({
          id: listing.id,
          title: listing.title,
          email: listing.author_email,
          emailSent,
          blogUrl,
          success: true
        })

        console.log(`Processed listing: ${listing.title} for ${listing.author_email}`)

      } catch (error) {
        console.error(`Error processing listing ${listing.id}:`, error)
        results.push({
          id: listing.id,
          title: listing.title,
          email: listing.author_email,
          error: error.message,
          success: false
        })
      }

      // Rate limit: wait 1.5 seconds between emails to avoid hitting Resend limits
      if (i < listings.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 1500))
      }
    }

    // Retry missed notifications: startups that went live but email was never sent
    // Note: author->>email filter removed - JS operator not supported in .not() filter; JS null-check handles it
    const { data: missedStartups, error: missedError } = await supabase
      .from('startups')
      .select('id, title, slug, description, plan, author, launch_date')
      .eq('is_live', true)
      .eq('notification_sent', false)
      .order('launch_date', { ascending: true })
      .limit(30)

    if (missedError) {
      console.error('Error fetching missed notifications:', missedError)
    }

    const missedResults = []
    if (missedStartups && missedStartups.length > 0) {
      console.log(`Found ${missedStartups.length} startups with missed notifications, retrying...`)

      for (let i = 0; i < missedStartups.length; i++) {
        const startup = missedStartups[i]
        try {
          const listing = {
            ...startup,
            author_email: startup.author?.email,
            author_name: startup.author?.name,
          }

          // Compute blog URL deterministically + trigger generation non-blocking
          const blogUrl = `https://submithunt.com/blog/${startup.slug || slugify(startup.title)}-review`
          triggerBlogGeneration(startup.id)

          const emailSent = await sendLiveNotification(listing, blogUrl)

          if (emailSent) {
            await supabase
              .from('startups')
              .update({
                notification_sent: true,
                notification_sent_at: new Date().toISOString()
              })
              .eq('id', startup.id)
          }

          missedResults.push({
            id: startup.id,
            title: startup.title,
            email: listing.author_email,
            emailSent,
            blogUrl,
            retry: true,
            success: true
          })

          console.log(`Retried notification for: ${startup.title} - emailSent=${emailSent}`)
        } catch (error) {
          console.error(`Error retrying notification for ${startup.id}:`, error)
          missedResults.push({
            id: startup.id,
            title: startup.title,
            error: error.message,
            retry: true,
            success: false
          })
        }

        if (i < missedStartups.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500))
        }
      }
    }

    return new Response(
      JSON.stringify({
        message: `Processed ${results.length} new listings, retried ${missedResults.length} missed notifications`,
        success: true,
        results,
        missedResults
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

function triggerBlogGeneration(startupId: string): void {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  fetch(`${supabaseUrl}/functions/v1/generate-blog-post`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${supabaseServiceKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ startup_id: startupId })
  }).then(r => r.json()).then(r => console.log(`Blog triggered for ${startupId}: slug=${r.blog_slug}, duplicate=${r.duplicate}`)).catch(e => console.error(`Blog trigger error for ${startupId}:`, e))
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim()
}

async function sendLiveNotification(listing: any, blogUrl: string | null = null): Promise<boolean> {
  try {
    // Use Resend API for sending emails
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    
    if (!resendApiKey) {
      console.log('No Resend API key found, skipping email')
      return false
    }

    if (!listing.author_email) {
      console.log(`No email found for listing: ${listing.title} - cannot send notification`)
      return false
    }

    const startupUrl = `https://submithunt.com/startup/${listing.slug || listing.id}`;
    const isPaid = listing.plan === 'premium' || listing.plan === 'featured' || listing.plan === 'pro' || listing.plan === 'lite';
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
      
      ${!isPaid ? `
      <!-- Upsell for Free Users -->
      <div style="background: #1a1a1a; border-radius: 8px; padding: 28px; margin: 25px 0;">
        <p style="margin: 0 0 6px 0; color: #f59e0b; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">For ${listing.title}</p>
        <h3 style="margin: 0 0 12px 0; color: #fff; font-size: 22px; line-height: 1.3;">Get a guaranteed dofollow backlink for $20</h3>
        <p style="margin: 0 0 20px 0; color: #ccc; font-size: 14px; line-height: 1.6;">
          Most founders pay $50-200 for a single backlink from a DR 37+ site. With a Premium upgrade, you get one automatically — plus your listing stays on the homepage for 14 days instead of 7.
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
          <a href="https://submithunt.com/pricing" style="display: inline-block; background-color: #f59e0b; color: #000; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px;">Upgrade to Premium — $20</a>
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
        <a href="${blogUrl}" style="display: inline-block; background-color: #16a34a; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">Read your blog post →</a>
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
        <a href="https://submithunt.com" style="color: #60a5fa; text-decoration: none;">SubmitHunt</a> — Where founders launch and get discovered
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

${!isPaid ? `GET A GUARANTEED BACKLINK FOR $20
Most founders pay $50-200 for a single backlink from a DR 37+ site. With a Premium upgrade, you get one automatically — plus your listing stays on the homepage for 14 days instead of 7.

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

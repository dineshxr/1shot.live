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
    const resendApiKey = Deno.env.get('RESEND_API_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get parameters from request
    const { days_back = 7, force_resend = false } = await req.json().catch(() => ({}))

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - days_back)

    console.log(`Fetching startups from ${startDate.toISOString()} to ${endDate.toISOString()}`)

    // Fetch all live startups from the last N days
    const { data: startups, error: fetchError } = await supabase
      .from('startups')
      .select('id, title, slug, description, plan, author, launch_date, notification_sent, is_live')
      .eq('is_live', true)
      .gte('launch_date', startDate.toISOString().split('T')[0])
      .lte('launch_date', endDate.toISOString().split('T')[0])
      .order('launch_date', { ascending: false })

    if (fetchError) {
      console.error('Error fetching startups:', fetchError)
      throw fetchError
    }

    console.log(`Found ${startups?.length || 0} live startups in date range`)

    // Filter startups that need emails
    const startupsNeedingEmails = (startups || []).filter(s => {
      const hasEmail = s.author?.email && s.author.email !== ''
      const needsEmail = !s.notification_sent || force_resend
      
      if (!hasEmail) {
        console.log(`Skipping ${s.title} - no email address`)
        return false
      }
      
      if (!needsEmail && !force_resend) {
        console.log(`Skipping ${s.title} - notification already sent`)
        return false
      }
      
      return true
    })

    console.log(`${startupsNeedingEmails.length} startups need email notifications`)

    const results = []
    
    for (let i = 0; i < startupsNeedingEmails.length; i++) {
      const startup = startupsNeedingEmails[i]
      
      try {
        // Send email via send-live-notification function
        const emailSent = await sendNotificationEmail(startup, resendApiKey)
        
        if (emailSent) {
          // Mark as sent in database
          await supabase
            .from('startups')
            .update({
              notification_sent: true,
              notification_sent_at: new Date().toISOString()
            })
            .eq('id', startup.id)
          
          results.push({
            id: startup.id,
            title: startup.title,
            email: startup.author.email,
            success: true,
            message: 'Email sent successfully'
          })
          
          console.log(`✓ Sent email for ${startup.title} to ${startup.author.email}`)
        } else {
          results.push({
            id: startup.id,
            title: startup.title,
            email: startup.author.email,
            success: false,
            message: 'Failed to send email'
          })
          
          console.log(`✗ Failed to send email for ${startup.title}`)
        }
        
        // Rate limit: wait 1.5 seconds between emails
        if (i < startupsNeedingEmails.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1500))
        }
        
      } catch (error) {
        console.error(`Error processing ${startup.title}:`, error)
        results.push({
          id: startup.id,
          title: startup.title,
          email: startup.author?.email,
          success: false,
          error: error.message
        })
      }
    }

    const successCount = results.filter(r => r.success).length
    const failCount = results.filter(r => !r.success).length

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${results.length} startups`,
        stats: {
          total_found: startups?.length || 0,
          emails_sent: successCount,
          failed: failCount,
          skipped: (startups?.length || 0) - startupsNeedingEmails.length
        },
        results
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

async function sendNotificationEmail(startup: any, resendApiKey: string): Promise<boolean> {
  try {
    if (!startup.author?.email) {
      console.log(`No email for ${startup.title}`)
      return false
    }

    const startupUrl = `https://submithunt.com/startup/${startup.slug || startup.id}`
    const isPaid = startup.plan === 'premium' || startup.plan === 'featured' || startup.plan === 'pro' || startup.plan === 'lite'
    const shareText = encodeURIComponent(`I just launched ${startup.title} on @SubmitHunt! Check it out and give it an upvote 🚀`)

    const emailData = {
      from: 'SubmitHunt <hello@submithunt.com>',
      to: [startup.author.email],
      subject: `${startup.title} is live — here's how to maximize your launch`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${startup.title} is Live on SubmitHunt</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; margin-top: 20px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
    
    <!-- Header -->
    <div style="background-color: #60a5fa; padding: 30px; text-align: center; border-bottom: 4px solid #000;">
      <h1 style="margin: 0; color: #000; font-size: 26px; font-weight: bold;">${startup.title} is LIVE</h1>
      <p style="margin: 8px 0 0 0; color: #1a1a1a; font-size: 15px;">Your listing is now visible to thousands of founders and early adopters</p>
    </div>
    
    <!-- Main Content -->
    <div style="padding: 30px;">
      <p style="font-size: 16px; color: #333; margin-bottom: 20px; line-height: 1.6;">
        Hey ${startup.author?.name || 'there'},
      </p>
      
      <p style="font-size: 16px; color: #555; line-height: 1.6; margin-bottom: 0;">
        <strong>${startup.title}</strong> just went live on SubmitHunt. Your product page is ready:
      </p>
      
      <!-- Startup Card -->
      <div style="background-color: #f8f9fa; border: 2px solid #e9ecef; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <h2 style="margin: 0 0 8px 0; color: #333; font-size: 20px;">${startup.title}</h2>
        <p style="margin: 0 0 15px 0; color: #666; font-size: 14px; line-height: 1.5;">${startup.description?.substring(0, 150) || ''}${startup.description?.length > 150 ? '...' : ''}</p>
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
        <p style="margin: 0 0 6px 0; color: #f59e0b; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">For ${startup.title}</p>
        <h3 style="margin: 0 0 12px 0; color: #fff; font-size: 22px; line-height: 1.3;">Get a guaranteed dofollow backlink for $5</h3>
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
          <a href="https://submithunt.com/pricing" style="display: inline-block; background-color: #f59e0b; color: #000; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px;">Upgrade to Premium &mdash; $5</a>
        </div>
        <p style="margin: 12px 0 0 0; color: #888; font-size: 12px; text-align: center;">One-time payment. No subscription.</p>
      </div>
      ` : `
      <!-- Paid Plan Thank You -->
      <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 8px; padding: 25px; margin: 25px 0;">
        <h3 style="margin: 0 0 10px 0; color: #fff; font-size: 18px;">Your Premium benefits are active</h3>
        <p style="margin: 0; color: #fff; font-size: 14px; line-height: 1.6; opacity: 0.95;">
          Your listing has priority placement and extended homepage visibility. Your dofollow backlink (37+ DR) will be live within 24 hours. We'll also feature ${startup.title} in our next newsletter to 2,000+ subscribers.
        </p>
      </div>
      `}
      
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
      `
    }

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(emailData)
    })

    if (!response.ok) {
      const errorText = await response.text()
      console.error('Resend API error:', errorText)
      return false
    }

    const result = await response.json()
    console.log('Email sent:', result)
    return true

  } catch (error) {
    console.error('Error sending email:', error)
    return false
  }
}

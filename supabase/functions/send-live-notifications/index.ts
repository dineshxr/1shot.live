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
        
        // Parse the launch_date as PST date to get correct day of week
        // launch_date is in YYYY-MM-DD format, we need to check if it's a weekday in PST
        const [year, month, day] = s.launch_date.split('-').map(Number)
        // Create date in PST timezone - month is 0-indexed
        const date = new Date(year, month - 1, day)
        // Get PST weekday string and convert to numeric (0=Sunday, 1=Monday, ..., 6=Saturday)
        const pstWeekdayString = date.toLocaleDateString('en-US', { 
          timeZone: 'America/Los_Angeles', 
          weekday: 'long' 
        })
        
        // Convert weekday string to numeric
        const weekdayMap: { [key: string]: number } = {
          'Sunday': 0, 'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 
          'Thursday': 4, 'Friday': 5, 'Saturday': 6
        }
        const dow = weekdayMap[pstWeekdayString] || 0
        
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

    if (!listings || listings.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: 'No listings to go live today',
          success: true,
          count: 0
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    // Process each listing with rate limiting delay between emails
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

        // Send email notification
        const emailSent = await sendLiveNotification(listing)

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

    return new Response(
      JSON.stringify({ 
        message: `Processed ${results.length} listings`,
        success: true,
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

async function sendLiveNotification(listing: any): Promise<boolean> {
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
      subject: `🚀 ${listing.title} is now LIVE on SubmitHunt!`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Startup is Live on SubmitHunt!</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; margin-top: 20px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
    
    <!-- Header -->
    <div style="background-color: #60a5fa; padding: 30px; text-align: center; border-bottom: 4px solid #000;">
      <h1 style="margin: 0; color: #000; font-size: 28px; font-weight: bold;">🚀 Your Startup is LIVE!</h1>
    </div>
    
    <!-- Main Content -->
    <div style="padding: 30px;">
      <p style="font-size: 18px; color: #333; margin-bottom: 20px;">
        Hey ${listing.author_name || 'there'}! Great news!
      </p>
      
      <p style="font-size: 16px; color: #555; line-height: 1.6;">
        <strong>${listing.title}</strong> is now live on SubmitHunt and visible to thousands of daily visitors!
      </p>
      
      <!-- Startup Card -->
      <div style="background-color: #f8f9fa; border: 2px solid #e9ecef; border-radius: 8px; padding: 20px; margin: 25px 0;">
        <h2 style="margin: 0 0 10px 0; color: #333; font-size: 20px;">${listing.title}</h2>
        <p style="margin: 0; color: #666; font-size: 14px; line-height: 1.5;">${listing.description?.substring(0, 150) || ''}${listing.description?.length > 150 ? '...' : ''}</p>
        <a href="${startupUrl}" style="display: inline-block; margin-top: 15px; background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">View Your Listing →</a>
      </div>
      
      <!-- Vote Reminder -->
      <div style="background-color: #fef3c7; border: 2px solid #f59e0b; border-radius: 8px; padding: 20px; margin: 25px 0;">
        <h3 style="margin: 0 0 10px 0; color: #92400e; font-size: 18px;">⬆️ Get More Votes!</h3>
        <p style="margin: 0; color: #78350f; font-size: 14px; line-height: 1.5;">
          Share your listing with your audience and ask them to upvote! The more votes you get, the higher you'll rank on the homepage.
        </p>
        <p style="margin: 12px 0 0 0; color: #92400e; font-size: 14px; font-weight: bold;">
          🏆 Top 3 ranking products get a special badge + high authority backlink!
        </p>
        <a href="https://twitter.com/intent/tweet?text=${shareText}&url=${encodeURIComponent(startupUrl)}" style="display: inline-block; margin-top: 15px; background-color: #000; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">Share on X →</a>
      </div>
      
      ${!isPaid ? `
      <!-- How to Get a Backlink -->
      <div style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); border-radius: 8px; padding: 25px; margin: 25px 0; text-align: center;">
        <h3 style="margin: 0 0 10px 0; color: #fff; font-size: 20px;">� Want a Guaranteed Backlink?</h3>
        <p style="margin: 0 0 15px 0; color: #fff; font-size: 14px; line-height: 1.6; opacity: 0.95;">
          Free listings can earn a backlink by finishing in the <strong>Top 3</strong> on launch day. Or guarantee one instantly by upgrading:
        </p>
        <ul style="text-align: left; color: #fff; font-size: 14px; margin: 0 0 20px 0; padding-left: 20px;">
          <li style="margin-bottom: 8px;">✅ <strong>Guaranteed high-authority backlink</strong></li>
          <li style="margin-bottom: 8px;">✅ X &amp; LinkedIn promotion</li>
          <li style="margin-bottom: 8px;">✅ Newsletter feature (2K+ subscribers)</li>
          <li style="margin-bottom: 8px;">✅ Verified badge on your listing</li>
        </ul>
        <a href="https://submithunt.com/pricing" style="display: inline-block; background-color: #fff; color: #2563eb; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">View Pricing Plans →</a>
      </div>
      ` : `
      <!-- Paid Plan Thank You -->
      <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 8px; padding: 25px; margin: 25px 0; text-align: center;">
        <h3 style="margin: 0 0 10px 0; color: #fff; font-size: 20px;">🎉 Thank You for Your Support!</h3>
        <p style="margin: 0; color: #fff; font-size: 14px; line-height: 1.5; opacity: 0.9;">
          Your listing has priority placement and you'll receive your guaranteed backlink within 24 hours!
        </p>
      </div>
      `}
      
      <!-- Tips -->
      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e9ecef;">
        <h4 style="margin: 0 0 15px 0; color: #333; font-size: 16px;">💡 Quick Tips to Maximize Your Launch:</h4>
        <ol style="color: #555; font-size: 14px; line-height: 1.8; padding-left: 20px; margin: 0;">
          <li>Share on social media and tag @SubmitHunt</li>
          <li>Ask your community to upvote</li>
          <li>Engage with comments on your listing</li>
          <li>Reply to feedback and questions</li>
        </ol>
      </div>
    </div>
    
    <!-- Footer -->
    <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
      <p style="margin: 0 0 10px 0; color: #666; font-size: 14px;">
        Good luck with your launch! 🍀
      </p>
      <p style="margin: 0; color: #999; font-size: 12px;">
        <a href="https://submithunt.com" style="color: #60a5fa; text-decoration: none;">SubmitHunt</a> - Launch your startup to thousands of daily visitors
      </p>
    </div>
  </div>
</body>
</html>
      `,
      text: `
🚀 ${listing.title} is now LIVE on SubmitHunt!

Hey ${listing.author_name || 'there'}! Great news!

${listing.title} is now live on SubmitHunt and visible to thousands of daily visitors!

View your listing: ${startupUrl}

⬆️ GET MORE VOTES!
Share your listing with your audience and ask them to upvote! The more votes you get, the higher you'll rank on the homepage.

🏆 Top 3 ranking products get a special badge + high authority backlink!

Share on X: https://twitter.com/intent/tweet?text=${shareText}&url=${encodeURIComponent(startupUrl)}

${!isPaid ? `
� WANT A GUARANTEED BACKLINK?
Free listings can earn a backlink by finishing in the Top 3 on launch day.
Or guarantee one instantly by upgrading:
- Guaranteed high-authority backlink
- X & LinkedIn promotion
- Newsletter feature (2K+ subscribers)
- Verified badge on your listing

View plans: https://submithunt.com/pricing
` : `
🎉 Thank you for your support! Your listing has priority placement and you'll receive your guaranteed backlink within 24 hours.
`}

💡 Quick Tips:
1. Share on social media and tag @SubmitHunt
2. Ask your community to upvote
3. Engage with comments on your listing
4. Reply to feedback and questions

Good luck with your launch! 🍀
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

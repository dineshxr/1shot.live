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

    console.log("Sending missed notifications for all startups...")

    // Get all live startups that haven't received notifications but have emails
    const { data: startups, error: startupsError } = await supabase
      .from('startups')
      .select('id, title, slug, description, plan, author, launch_date, is_live, notification_sent, notification_sent_at, created_at')
      .eq('is_live', true)
      .eq('notification_sent', false)
      .not('author->>email', 'is', null)
      .order('created_at', { ascending: false })

    if (startupsError) {
      console.error('Error fetching startups:', startupsError)
      throw startupsError
    }

    console.log(`Found ${startups?.length || 0} startups with missed notifications`)

    if (!startups || startups.length === 0) {
      return new Response(
        JSON.stringify({ 
          message: 'No missed notifications found',
          count: 0
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    // Process each startup with missed notifications
    const results = []
    for (const startup of startups) {
      try {
        console.log(`Sending missed notification for: ${startup.title} (${startup.plan})`)

        // Send live notification
        const emailSent = await sendLiveNotification({
          ...startup,
          author_email: startup.author.email,
          author_name: startup.author.name,
        })

        // Update notification status
        await supabase
          .from('startups')
          .update({
            notification_sent: emailSent,
            notification_sent_at: new Date().toISOString()
          })
          .eq('id', startup.id)

        results.push({
          id: startup.id,
          title: startup.title,
          plan: startup.plan,
          email: startup.author.email,
          created_at: startup.created_at,
          launch_date: startup.launch_date,
          emailSent,
          success: true
        })

        console.log(`Processed missed notification: ${startup.title} for ${startup.author.email}`)

      } catch (error) {
        console.error(`Error processing missed notification ${startup.id}:`, error)
        results.push({
          id: startup.id,
          title: startup.title,
          plan: startup.plan,
          email: startup.author.email,
          created_at: startup.created_at,
          launch_date: startup.launch_date,
          error: error.message,
          success: false
        })
      }
    }

    return new Response(
      JSON.stringify({ 
        message: `Processed ${results.length} missed notifications`,
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

    const startupUrl = `https://submithunt.com/startup/${listing.slug || listing.id}`;
    const isPremiumOrFeatured = listing.plan === 'premium' || listing.plan === 'featured';
    const shareText = encodeURIComponent(`I just launched ${listing.title} on @SubmitHunt! Check it out and give it an upvote 🚀`);

    console.log(`Sending missed email to: ${listing.author_email} (${listing.title})`)

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
      
      ${!isPremiumOrFeatured ? `
      <!-- Upgrade CTA -->
      <div style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); border-radius: 8px; padding: 25px; margin: 25px 0; text-align: center;">
        <h3 style="margin: 0 0 10px 0; color: #fff; font-size: 20px;">🔥 Want More Visibility?</h3>
        <p style="margin: 0 0 15px 0; color: #fff; font-size: 14px; line-height: 1.5; opacity: 0.9;">
          Upgrade to Premium for just $5 and get:
        </p>
        <ul style="text-align: left; color: #fff; font-size: 14px; margin: 0 0 20px 0; padding-left: 20px;">
          <li style="margin-bottom: 8px;">✅ <strong>Guaranteed high authority backlink</strong></li>
          <li style="margin-bottom: 8px;">✅ 14 days on homepage (vs 7 days)</li>
          <li style="margin-bottom: 8px;">✅ Featured in our newsletter</li>
          <li style="margin-bottom: 8px;">✅ Skip the queue next time</li>
        </ul>
        <a href="https://submithunt.com/submit" style="display: inline-block; background-color: #fff; color: #ea580c; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Upgrade to Premium →</a>
      </div>
      ` : `
      <!-- Premium Thank You -->
      <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); border-radius: 8px; padding: 25px; margin: 25px 0; text-align: center;">
        <h3 style="margin: 0 0 10px 0; color: #fff; font-size: 20px;">🎉 Thank You for Going Premium!</h3>
        <p style="margin: 0; color: #fff; font-size: 14px; line-height: 1.5; opacity: 0.9;">
          Your listing is featured with priority placement. You'll receive your guaranteed backlink within 24 hours!
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

${!isPremiumOrFeatured ? `
🔥 WANT MORE VISIBILITY?
Upgrade to Premium for just $5 and get:
- Guaranteed high authority backlink
- 14 days on homepage (vs 7 days)
- Featured in our newsletter
- Skip the queue next time

Upgrade now: https://submithunt.com/submit
` : `
🎉 Thank you for going Premium! Your listing is featured with priority placement.
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
    console.log('Missed email sent successfully:', result)
    return true

  } catch (error) {
    console.error('Error sending missed email:', error)
    return false
  }
}

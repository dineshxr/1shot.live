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

    // Get current time in PST
    const now = new Date()
    const pstTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Los_Angeles"}))
    const currentHour = pstTime.getHours()
    
    console.log(`Current PST time: ${pstTime.toISOString()}, Hour: ${currentHour}`)

    // Only run at 8 AM PST or later
    if (currentHour < 8) {
      return new Response(
        JSON.stringify({ 
          message: `Too early - current hour is ${currentHour} PST. Notifications sent at 8 AM PST.`,
          success: true 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      )
    }

    // Get listings that should go live today
    const { data: listings, error: listingsError } = await supabase
      .rpc('get_listings_to_go_live')

    if (listingsError) {
      console.error('Error fetching listings to go live:', listingsError)
      throw listingsError
    }

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

    // Process each listing
    const results = []
    for (const listing of listings) {
      try {
        // Mark listing as live
        await supabase.rpc('mark_listing_live', { listing_id: listing.id })

        // Send email notification
        const emailSent = await sendLiveNotification(listing)

        // Update notification status
        await supabase
          .from('startups')
          .update({
            notification_sent: true,
            notification_sent_at: new Date().toISOString()
          })
          .eq('id', listing.id)

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

    const emailData = {
      from: 'SubmitHunt <notifications@submithunt.com>',
      to: [listing.author_email],
      subject: `🚀 Your startup "${listing.title}" is now live on SubmitHunt!`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Your Startup is Live!</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="background: #f8f9fa; padding: 30px; border-radius: 10px; text-align: center; margin-bottom: 30px;">
            <h1 style="color: #2563eb; margin: 0 0 10px 0;">🚀 Congratulations!</h1>
            <h2 style="color: #1f2937; margin: 0;">Your startup is now live on SubmitHunt!</h2>
          </div>
          
          <div style="background: white; padding: 25px; border: 2px solid #e5e7eb; border-radius: 8px; margin-bottom: 25px;">
            <h3 style="color: #1f2937; margin-top: 0;">"${listing.title}" is now featured on our homepage</h3>
            <p>Your startup has gone live and is now visible to our community of founders, investors, and tech enthusiasts.</p>
            
            <div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 15px; margin: 20px 0;">
              <p style="margin: 0; font-weight: bold; color: #92400e;">
                📈 Pro tip: Share your launch on social media for maximum exposure!
              </p>
            </div>
          </div>

          <div style="text-align: center; margin: 30px 0;">
            <a href="https://submithunt.com/startup/${listing.slug || listing.id}" 
               style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">
              View Your Live Listing
            </a>
          </div>

          <div style="background: #f3f4f6; padding: 20px; border-radius: 6px; margin-top: 30px;">
            <h4 style="margin-top: 0; color: #374151;">What's next?</h4>
            <ul style="color: #6b7280; padding-left: 20px;">
              <li>Share your launch on X (Twitter), LinkedIn, and other social platforms</li>
              <li>Engage with the SubmitHunt community</li>
              <li>Monitor your listing performance in your <a href="https://submithunt.com/dashboard.html" style="color: #2563eb;">dashboard</a></li>
              <li>Consider upgrading to featured for more visibility</li>
            </ul>
          </div>

          <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
            <p style="color: #6b7280; font-size: 14px;">
              Best of luck with your launch!<br>
              The SubmitHunt Team
            </p>
            <div style="margin-top: 15px;">
              <a href="https://twitter.com/submithunt" style="color: #2563eb; text-decoration: none; margin: 0 10px;">Twitter</a>
              <a href="https://submithunt.com" style="color: #2563eb; text-decoration: none; margin: 0 10px;">Website</a>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
🚀 Congratulations! Your startup "${listing.title}" is now live on SubmitHunt!

Your startup has gone live and is now visible to our community of founders, investors, and tech enthusiasts.

View your live listing: https://submithunt.com/startup/${listing.slug || listing.id}

What's next?
- Share your launch on social media platforms
- Engage with the SubmitHunt community  
- Monitor your performance in your dashboard: https://submithunt.com/dashboard.html
- Consider upgrading to featured for more visibility

Best of luck with your launch!
The SubmitHunt Team

Follow us: https://twitter.com/submithunt
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

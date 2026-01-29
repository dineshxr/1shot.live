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

    console.log("Testing email sending functionality...")

    // Check if Resend API key is available
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    
    if (!resendApiKey) {
      console.error('RESEND_API_KEY environment variable is not set')
      return new Response(
        JSON.stringify({ 
          error: 'RESEND_API_KEY environment variable is not set',
          success: false
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      )
    }

    console.log('Resend API key is available')

    // Get a test startup to send email for
    const { data: testStartup, error: startupError } = await supabase
      .from('startups')
      .select('id, title, slug, description, plan, author')
      .eq('is_live', true)
      .eq('plan', 'premium')
      .limit(1)
      .single()

    if (startupError || !testStartup) {
      console.error('No test startup found:', startupError)
      return new Response(
        JSON.stringify({ 
          error: 'No test startup found',
          details: startupError
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404 
        }
      )
    }

    console.log(`Test startup found: ${testStartup.title}`)

    // Test email sending
    const startupUrl = `https://submithunt.com/startup/${testStartup.slug || testStartup.id}`;
    const testEmailData = {
      from: 'SubmitHunt <hello@submithunt.com>',
      to: [testStartup.author?.email || 'test@example.com'],
      subject: `🧪 Test: ${testStartup.title} is LIVE on SubmitHunt!`,
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Email</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; margin-top: 20px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
    
    <!-- Header -->
    <div style="background-color: #60a5fa; padding: 30px; text-align: center; border-bottom: 4px solid #000;">
      <h1 style="margin: 0; color: #000; font-size: 28px; font-weight: bold;">🧪 TEST EMAIL</h1>
    </div>
    
    <!-- Main Content -->
    <div style="padding: 30px;">
      <p style="font-size: 18px; color: #333; margin-bottom: 20px;">
        This is a test email to verify Resend integration is working.
      </p>
      
      <p style="font-size: 16px; color: #555; line-height: 1.6;">
        <strong>${testStartup.title}</strong> is being used for testing.
      </p>
      
      <!-- Startup Card -->
      <div style="background-color: #f8f9fa; border: 2px solid #e9ecef; border-radius: 8px; padding: 20px; margin: 25px 0;">
        <h2 style="margin: 0 0 10px 0; color: #333; font-size: 20px;">${testStartup.title}</h2>
        <p style="margin: 0; color: #666; font-size: 14px; line-height: 1.5;">${testStartup.description?.substring(0, 150) || ''}${testStartup.description?.length > 150 ? '...' : ''}</p>
        <a href="${startupUrl}" style="display: inline-block; margin-top: 15px; background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">View Your Listing →</a>
      </div>
      
      <div style="background-color: #e3f2fd; border: 2px solid #2196f3; border-radius: 8px; padding: 20px; margin: 25px 0;">
        <h3 style="margin: 0 0 10px 0; color: #1565c0; font-size: 18px;">📧 Email Test Results</h3>
        <p style="margin: 0; color: #1976d2; font-size: 14px; line-height: 1.5;">
          If you receive this email, the Resend integration is working correctly.
        </p>
      </div>
    </div>
    
    <!-- Footer -->
    <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
      <p style="margin: 0 0 10px 0; color: #666; font-size: 14px;">
        SubmitHunt Email Test
      </p>
      <p style="margin: 0; color: #999; font-size: 12px;">
        <a href="https://submithunt.com" style="color: #60a5fa; text-decoration: none;">SubmitHunt</a>
      </p>
    </div>
  </div>
</body>
</html>
      `,
      text: `
🧪 TEST EMAIL

This is a test email to verify Resend integration is working.

${testStartup.title} is being used for testing.

View your listing: ${startupUrl}

If you receive this email, the Resend integration is working correctly.

SubmitHunt Email Test
      `
    }

    console.log('Sending test email to:', testStartup.author?.email || 'test@example.com')

    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(testEmailData),
    })

    console.log('Resend API response status:', response.status)

    if (!response.ok) {
      const errorData = await response.text()
      console.error('Resend API error:', errorData)
      return new Response(
        JSON.stringify({ 
          error: 'Failed to send test email',
          details: errorData,
          status: response.status
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500 
        }
      )
    }

    const result = await response.json()
    console.log('Test email sent successfully:', result)

    return new Response(
      JSON.stringify({ 
        message: 'Test email sent successfully',
        result: result,
        testStartup: {
          title: testStartup.title,
          email: testStartup.author?.email,
          plan: testStartup.plan
        },
        success: true
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    )

  } catch (error) {
    console.error('Test function error:', error)
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

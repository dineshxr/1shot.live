import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Sent right after a FREE submission (mirrors the submit flow's success
// screen): confirms the queue spot + launch date, reminds them to add the
// badge for the do-follow backlink if they skipped it, and pitches Premium.
// Paid plans get their confirmation from publish-paid-startup instead — one
// email per paid launch, no duplicates.

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // verify_jwt is disabled (called by a DB trigger via pg_net). The shared
  // secret is the auth gate; it lives in Vault and the CRON_SECRET edge secret.
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
    )
  }

  try {
    const { startup_id } = await req.json()
    if (!startup_id) {
      return json({ error: 'startup_id required' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: startup, error } = await supabase
      .from('startups')
      .select('id, title, slug, description, plan, author, launch_date, is_live, archived, backlink_verified_at, confirmation_sent_at')
      .eq('id', startup_id)
      .single()

    if (error || !startup) {
      return json({ skipped: 'startup not found' })
    }
    if (startup.confirmation_sent_at) {
      return json({ skipped: 'already confirmed' })
    }
    if (startup.archived) {
      return json({ skipped: 'archived' })
    }

    const paidPlans = ['premium', 'featured', 'pro', 'lite']
    if (paidPlans.includes(startup.plan)) {
      return json({ skipped: 'paid plan — confirmation handled by publish-paid-startup' })
    }

    const authorEmail = startup.author?.email
    if (!authorEmail) {
      return json({ skipped: 'no author email' })
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      return json({ skipped: 'no RESEND_API_KEY' })
    }

    const emailSent = await sendConfirmationEmail(resendApiKey, startup, authorEmail)

    if (emailSent) {
      await supabase
        .from('startups')
        .update({ confirmation_sent_at: new Date().toISOString() })
        .eq('id', startup.id)
    }

    return json({ success: true, emailSent, startup: startup.title })
  } catch (error) {
    console.error('send-submission-confirmation error:', error)
    return json({ error: error.message, success: false }, 500)
  }
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

// launch_date is YYYY-MM-DD; format in UTC so the weekday doesn't shift.
function formatLaunchDate(launchDate: string | null): string {
  if (!launchDate) return 'your selected launch date'
  const [y, m, d] = launchDate.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC',
  })
}

async function sendConfirmationEmail(resendApiKey: string, startup: any, authorEmail: string): Promise<boolean> {
  const launchDay = formatLaunchDate(startup.launch_date)
  const authorName = startup.author?.name
  const showBadgeReminder = !startup.backlink_verified_at

  const badgeEmbed = '<a href="https://submithunt.com" target="_blank"><img src="https://submithunt.com/badge-light.svg" alt="Featured on Submit Hunt" width="240" height="66" /></a>'
  const badgeEmbedEscaped = badgeEmbed.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const emailData = {
    from: 'SubmitHunt <hello@submithunt.com>',
    to: [authorEmail],
    subject: `You're in — ${startup.title} launches ${launchDay}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${startup.title} is queued on SubmitHunt</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; margin-top: 20px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">

    <!-- Header -->
    <div style="background-color: #60a5fa; padding: 30px; text-align: center; border-bottom: 4px solid #000;">
      <h1 style="margin: 0; color: #000; font-size: 24px; font-weight: bold;">Submission confirmed</h1>
      <p style="margin: 8px 0 0 0; color: #1a1a1a; font-size: 15px;">${startup.title} is in the launch queue</p>
    </div>

    <!-- Main Content -->
    <div style="padding: 30px;">
      <p style="font-size: 16px; color: #333; margin: 0 0 20px 0; line-height: 1.6;">
        Hey ${authorName || 'there'},
      </p>

      <p style="font-size: 16px; color: #555; line-height: 1.6; margin: 0;">
        <strong>${startup.title}</strong> is confirmed and scheduled. Here's your launch summary:
      </p>

      <!-- Summary Card -->
      <div style="background-color: #f8f9fa; border: 2px solid #e9ecef; border-radius: 8px; padding: 20px; margin: 20px 0;">
        <h2 style="margin: 0 0 8px 0; color: #333; font-size: 20px;">${startup.title}</h2>
        <p style="margin: 0 0 15px 0; color: #666; font-size: 14px; line-height: 1.5;">${startup.description?.substring(0, 150) || ''}${startup.description?.length > 150 ? '...' : ''}</p>
        <table cellpadding="0" cellspacing="0" style="width: 100%; font-size: 14px;">
          <tr>
            <td style="padding: 6px 0; color: #888; width: 110px;">Plan</td>
            <td style="padding: 6px 0; color: #333; font-weight: bold;">Free launch</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #888;">Launch day</td>
            <td style="padding: 6px 0; color: #333; font-weight: bold;">${launchDay}, 8:00 AM PST</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #888;">Homepage run</td>
            <td style="padding: 6px 0; color: #333; font-weight: bold;">7 days</td>
          </tr>
        </table>
      </div>

      <!-- What happens next -->
      <div style="margin: 24px 0;">
        <h4 style="margin: 0 0 12px 0; color: #333; font-size: 16px;">What happens next</h4>
        <table style="width: 100%;" cellpadding="0" cellspacing="0">
          <tr><td style="padding: 5px 0; color: #555; font-size: 14px;">1. ${startup.title} goes live automatically on ${launchDay} at 8 AM PST</td></tr>
          <tr><td style="padding: 5px 0; color: #555; font-size: 14px;">2. You'll get an email with your live listing link + a dedicated SEO blog post about your product</td></tr>
          <tr><td style="padding: 5px 0; color: #555; font-size: 14px;">3. You stay on the homepage for 7 days — Top 3 by upvotes on launch day earns a permanent badge + dofollow backlink</td></tr>
        </table>
      </div>

      ${showBadgeReminder ? `
      <!-- Badge reminder (skipped at submit time) -->
      <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 0 8px 8px 0; padding: 20px; margin: 25px 0;">
        <h3 style="margin: 0 0 8px 0; color: #1e40af; font-size: 16px;">Don't leave your free DR 37+ backlink on the table</h3>
        <p style="margin: 0 0 14px 0; color: #1e3a8a; font-size: 14px; line-height: 1.6;">
          You skipped the badge step. Add our badge to your homepage or footer (keep it do-follow) before launch day and your listing becomes <strong>permanent</strong> — and your backlink from our DR 37+ site stays <strong>dofollow</strong>. Free either way.
        </p>
        <div style="text-align: center; margin-bottom: 14px;">
          <img src="https://submithunt.com/badge-light.svg" alt="Featured on Submit Hunt" width="200" style="height: auto;" />
        </div>
        <p style="margin: 0 0 6px 0; color: #1e3a8a; font-size: 12px; font-weight: bold;">Paste this on your site:</p>
        <div style="background: #0b1220; color: #e5e7eb; padding: 12px; border-radius: 6px; font-size: 12px; font-family: monospace; word-break: break-all; line-height: 1.5;">${badgeEmbedEscaped}</div>
        <div style="text-align: center; margin-top: 16px;">
          <a href="https://submithunt.com/dashboard" style="display: inline-block; background-color: #3b82f6; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">Verify it from your dashboard</a>
        </div>
      </div>
      ` : ''}

      <!-- Skip-the-queue upsell -->
      <div style="background: #1a1a1a; border-radius: 8px; padding: 26px; margin: 25px 0;">
        <p style="margin: 0 0 6px 0; color: #f59e0b; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">Don't want to wait?</p>
        <h3 style="margin: 0 0 12px 0; color: #fff; font-size: 21px; line-height: 1.3;">Skip the queue — launch ${startup.title} today</h3>
        <p style="margin: 0 0 18px 0; color: #ccc; font-size: 14px; line-height: 1.6;">
          Premium launches go live immediately instead of waiting for a free slot — and stay on the homepage for 14 days instead of 7, with a guaranteed dofollow backlink from our DR 37+ site and a spot in our newsletter to 2,000+ subscribers.
        </p>
        <div style="text-align: center;">
          <a href="https://submithunt.com/pricing" style="display: inline-block; background-color: #f59e0b; color: #000; padding: 13px 30px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 15px;">Upgrade to Premium — $20 one-time</a>
        </div>
      </div>
    </div>

    <!-- Footer -->
    <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
      <p style="margin: 0 0 8px 0; color: #666; font-size: 14px;">
        See you on launch day.
      </p>
      <p style="margin: 0; color: #999; font-size: 12px;">
        <a href="https://submithunt.com" style="color: #60a5fa; text-decoration: none;">SubmitHunt</a> — Where founders launch and get discovered
      </p>
    </div>
  </div>
</body>
</html>
    `,
    text: `Submission confirmed — ${startup.title} is in the launch queue

Hey ${authorName || 'there'},

${startup.title} is confirmed and scheduled.

YOUR LAUNCH SUMMARY
- Plan: Free launch
- Launch day: ${launchDay}, 8:00 AM PST
- Homepage run: 7 days

WHAT HAPPENS NEXT
1. ${startup.title} goes live automatically on ${launchDay} at 8 AM PST
2. You'll get an email with your live listing link + a dedicated SEO blog post about your product
3. You stay on the homepage for 7 days — Top 3 by upvotes on launch day earns a permanent badge + dofollow backlink

${showBadgeReminder ? `DON'T LEAVE YOUR FREE DR 37+ BACKLINK ON THE TABLE
You skipped the badge step. Add our badge to your homepage or footer (keep it do-follow) before launch day and your listing becomes permanent — and your backlink from our DR 37+ site stays dofollow. Free either way.

Paste this on your site:
${badgeEmbed}

Verify it from your dashboard: https://submithunt.com/dashboard

` : ''}DON'T WANT TO WAIT?
Premium launches go live immediately instead of waiting for a free slot — and stay on the homepage for 14 days instead of 7, with a guaranteed dofollow backlink from our DR 37+ site and a spot in our newsletter to 2,000+ subscribers.

Upgrade to Premium ($20 one-time): https://submithunt.com/pricing

See you on launch day.
The SubmitHunt Team
`,
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
    console.error('Resend API error:', await response.text())
    return false
  }
  console.log('Submission confirmation sent:', await response.json())
  return true
}

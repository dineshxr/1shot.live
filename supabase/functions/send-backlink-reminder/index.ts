import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from '../_shared/utils/cors.ts'
import { unsubscribeToken, unsubscribeUrl } from '../_shared/lib/unsubscribeToken.ts'
import { readStoredDr } from '../_shared/lib/domainRating.ts'

// Recurring marketing blast: reminds everyone who ever submitted a project of
// SubmitHunt's current Domain Rating and invites them to submit their next
// project for another dofollow backlink.
//
// Called hourly by pg_cron (trigger_backlink_reminder() -> pg_net, x-cron-secret
// auth like every other cron function). Each run emails up to BATCH_SIZE
// recipients who haven't received this campaign in the last INTERVAL_DAYS days
// (selection lives in the get_backlink_reminder_recipients SQL function, which
// also excludes unsubscribes and brand-new submitters). The effect: the whole
// list drains in the first day of each cycle, then goes quiet until recipients
// come due again ~3 weeks later. Sends are only logged on success, so failed or
// rate-limited emails are picked up by the next hourly run automatically.
//
// Body options (all optional):
//   { "test_email": "x@y.com" }  -> send ONE sample email there; no logging
//   { "dry_run": true }          -> return who would be emailed; send nothing

const CAMPAIGN = 'backlink-reminder'
const BATCH_SIZE = 50
const INTERVAL_DAYS = 21
const SEND_DELAY_MS = 1200

// DR comes from site_config['domain_rating'] at send time — the site-wide
// source of truth, refreshed weekly by the update-domain-rating cron (or by
// hand while Ahrefs offers us no API access). This constant is only the
// last-resort fallback if the config read itself fails.
const FALLBACK_DR = 37 // Ahrefs, measured 2026-07-28

interface Recipient {
  email: string
  name: string | null
  startup_title: string
  startup_slug: string | null
  startup_live: boolean
  startup_plan: string | null
  backlink_verified: boolean
}

// deno-lint-ignore no-explicit-any
async function currentDr(supabase: any): Promise<{ dr: number; fresh: boolean }> {
  const stored = await readStoredDr(supabase)
  if (!stored) return { dr: FALLBACK_DR, fresh: false }
  // "fresh" = measured within the last 7 days, i.e. the weekly probe (or a
  // manual re-measure) actually ran recently — gates the copy's freshness claim.
  const measured = Date.parse(stored.measured_at)
  const fresh = Number.isFinite(measured) && Date.now() - measured < 7 * 24 * 3600 * 1000
  return { dr: stored.value, fresh }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  // Same shared-secret gate as the other cron-driven functions.
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized', success: false }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 },
    )
  }

  try {
    const body = await req.json().catch(() => ({}))
    const testEmail: string | null = typeof body?.test_email === 'string' ? body.test_email : null
    const dryRun = body?.dry_run === true

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    if (testEmail) {
      const { dr, fresh } = await currentDr(supabase)
      const sample: Recipient = {
        email: testEmail,
        name: 'there',
        startup_title: 'Your Product',
        startup_slug: null,
        startup_live: true,
        startup_plan: 'free',
        backlink_verified: false,
      }
      const ok = await sendReminder(sample, dr, fresh, cronSecret)
      return json({ success: ok === 'sent', test: true, domain_rating: dr, dr_fresh: fresh, email: testEmail })
    }

    const { data: recipients, error: rpcError } = await supabase.rpc(
      'get_backlink_reminder_recipients',
      { batch_size: BATCH_SIZE, interval_days: INTERVAL_DAYS },
    )
    if (rpcError) throw rpcError

    const due: Recipient[] = recipients || []
    if (due.length === 0) {
      return json({ success: true, message: 'No recipients due', sent: 0 })
    }

    if (dryRun) {
      return json({ success: true, dry_run: true, due: due.length, recipients: due.map((r) => r.email) })
    }

    // One DR read per run, shared by every email in the batch.
    const { dr, fresh: drFresh } = await currentDr(supabase)
    console.log(`Blast run: ${due.length} due, DR=${dr} (fresh=${drFresh})`)

    let sent = 0
    let failed = 0
    let rateLimited = false
    for (let i = 0; i < due.length; i++) {
      const r = due[i]
      const ok = await sendReminder(r, dr, drFresh, cronSecret)
      if (ok === 'rate_limited') {
        // Resend quota hit (429): stop hammering. Everyone unsent stays due
        // and the next hourly run picks them up.
        console.log(`Rate limited after ${sent} sends; aborting run`)
        rateLimited = true
        break
      }
      if (ok === 'sent') {
        // Log only successful sends: anyone skipped by a failure stays "due"
        // and is retried by the next hourly run.
        const { error: logError } = await supabase
          .from('marketing_email_sends')
          .insert({ email: r.email, campaign: CAMPAIGN })
        if (logError) console.error(`Send logged FAILED for ${r.email}:`, logError)
        sent++
      } else {
        failed++
      }
      if (i < due.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, SEND_DELAY_MS))
      }
    }

    console.log(`Blast run done: sent=${sent} failed=${failed} rateLimited=${rateLimited}`)
    return json({ success: true, domain_rating: dr, due: due.length, sent, failed, rate_limited: rateLimited })
  } catch (error) {
    console.error('Function error:', error)
    return json({ error: (error as Error).message, success: false }, 500)
  }
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

async function sendReminder(
  r: Recipient,
  dr: number,
  drFresh: boolean,
  secret: string,
): Promise<'sent' | 'failed' | 'rate_limited'> {
  try {
    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      console.log('No Resend API key found, skipping email')
      return 'failed'
    }

    const firstName = (r.name || '').trim().split(/\s+/)[0] || 'there'
    const listingUrl = r.startup_slug
      ? `https://submithunt.com/startup/${r.startup_slug}`
      : 'https://submithunt.com'
    const token = await unsubscribeToken(r.email, secret)
    const unsubUrl = unsubscribeUrl(r.email, token, CAMPAIGN)

    // Free-plan makers who never verified a badge backlink get a reminder that
    // the link equity is still unclaimed; paid plans have their links handled.
    const isPaid = ['premium', 'featured', 'pro', 'lite'].includes(r.startup_plan || '')
    const showBadgeReminder = !isPaid && !r.backlink_verified

    const listingLine = r.startup_live
      ? `your listing for <strong>${r.startup_title}</strong> is live and linking on SubmitHunt`
      : `you submitted <strong>${r.startup_title}</strong> to SubmitHunt`

    const emailData = {
      from: 'SubmitHunt <hello@submithunt.com>',
      to: [r.email],
      subject: `Your next launch gets a DR ${dr} dofollow backlink`,
      headers: {
        'List-Unsubscribe': `<${unsubUrl}>`,
        'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
      },
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SubmitHunt is at Domain Rating ${dr}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; margin-top: 20px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">

    <!-- Header -->
    <div style="background-color: #60a5fa; padding: 30px; text-align: center; border-bottom: 4px solid #000;">
      <h1 style="margin: 0; color: #000; font-size: 26px; font-weight: bold;">SubmitHunt is at DR ${dr}</h1>
      <p style="margin: 8px 0 0 0; color: #1a1a1a; font-size: 15px;">${drFresh ? 'Checked on Ahrefs this week' : 'Measured by Ahrefs'} — and every listing gets a dofollow link from us</p>
    </div>

    <!-- Main Content -->
    <div style="padding: 30px;">
      <p style="font-size: 16px; color: #333; margin-bottom: 20px; line-height: 1.6;">
        Hey ${firstName},
      </p>

      <p style="font-size: 16px; color: #555; line-height: 1.6; margin-bottom: 20px;">
        Quick reminder while you're building: ${listingLine}, and SubmitHunt's Ahrefs Domain Rating is <strong>${dr}</strong>. Every project listed here gets a dofollow backlink from this domain — the kind of link founders routinely pay $50–200 for elsewhere.
      </p>

      <!-- Submit another project -->
      <div style="background-color: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 0 8px 8px 0; padding: 20px; margin: 25px 0;">
        <h3 style="margin: 0 0 8px 0; color: #92400e; font-size: 16px;">Launching something new?</h3>
        <p style="margin: 0 0 15px 0; color: #78350f; font-size: 14px; line-height: 1.6;">
          Side project, new tool, a fresh landing page — every project you submit gets its own listing, its own DR ${dr} dofollow backlink, and a fresh shot at the Top 3 badge. Submitting is free.
        </p>
        <a href="https://submithunt.com/submit" style="display: inline-block; background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">Submit your next project</a>
      </div>

      ${showBadgeReminder ? `
      <!-- Unclaimed badge backlink -->
      <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; border-radius: 0 8px 8px 0; padding: 20px; margin: 25px 0;">
        <h3 style="margin: 0 0 8px 0; color: #1e40af; font-size: 16px;">Still unclaimed: the backlink for ${r.startup_title}</h3>
        <p style="margin: 0 0 14px 0; color: #1e3a8a; font-size: 14px; line-height: 1.6;">
          You haven't verified a badge backlink for <a href="${listingUrl}" style="color: #1e40af;">${r.startup_title}</a> yet, so it isn't collecting the DR ${dr} link equity it could be. Add the badge to your site from your dashboard — it takes two minutes and it's free.
        </p>
        <a href="https://submithunt.com/dashboard" style="display: inline-block; background-color: #3b82f6; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">Claim it from your dashboard</a>
      </div>
      ` : ''}

      <p style="font-size: 14px; color: #777; line-height: 1.6; margin: 25px 0 0 0;">
        In a hurry? <a href="https://submithunt.com/pricing" style="color: #60a5fa;">Premium ($20)</a> skips the launch queue, doubles your homepage time, and guarantees the dofollow link.
      </p>
    </div>

    <!-- Footer -->
    <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
      <p style="margin: 0 0 8px 0; color: #999; font-size: 12px;">
        You're getting this occasional reminder because you submitted ${r.startup_title} to SubmitHunt.
      </p>
      <p style="margin: 0; color: #999; font-size: 12px;">
        <a href="https://submithunt.com" style="color: #60a5fa; text-decoration: none;">SubmitHunt</a> — Where founders launch and get discovered
        &nbsp;·&nbsp;
        <a href="${unsubUrl}" style="color: #999; text-decoration: underline;">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>
      `,
      text: `SubmitHunt is at DR ${dr}

Hey ${firstName},

Quick reminder while you're building: ${r.startup_live ? `your listing for ${r.startup_title} is live and linking on SubmitHunt` : `you submitted ${r.startup_title} to SubmitHunt`}, and SubmitHunt's Ahrefs Domain Rating is ${dr}${drFresh ? ' (checked this week)' : ''}. Every project listed here gets a dofollow backlink from this domain — the kind of link founders routinely pay $50–200 for elsewhere.

LAUNCHING SOMETHING NEW?
Side project, new tool, a fresh landing page — every project you submit gets its own listing, its own DR ${dr} dofollow backlink, and a fresh shot at the Top 3 badge. Submitting is free.

Submit your next project: https://submithunt.com/submit

${showBadgeReminder ? `STILL UNCLAIMED: THE BACKLINK FOR ${r.startup_title.toUpperCase()}
You haven't verified a badge backlink for ${r.startup_title} yet, so it isn't collecting the DR ${dr} link equity it could be. Add the badge from your dashboard — free, takes two minutes.
https://submithunt.com/dashboard

` : ''}In a hurry? Premium ($20) skips the launch queue, doubles your homepage time, and guarantees the dofollow link: https://submithunt.com/pricing

—
You're getting this occasional reminder because you submitted ${r.startup_title} to SubmitHunt.
Unsubscribe: ${unsubUrl}
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
      console.error(`Resend API error for ${r.email}:`, await response.text())
      return response.status === 429 ? 'rate_limited' : 'failed'
    }
    return 'sent'
  } catch (error) {
    console.error(`Error sending to ${r.email}:`, error)
    return 'failed'
  }
}

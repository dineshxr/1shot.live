import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Max owner emails per startup per hour — a busy comment thread becomes a few
// emails, not an inbox flood.
const MAX_EMAILS_PER_STARTUP_PER_HOUR = 5

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  // verify_jwt is disabled for this function (it's called by a DB trigger via
  // pg_net, which can't mint platform JWTs). This shared-secret check is the
  // auth gate; the secret lives in Vault (DB side) and the CRON_SECRET edge secret.
  const cronSecret = Deno.env.get('CRON_SECRET')
  if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
    )
  }

  try {
    const { comment_id } = await req.json()
    if (!comment_id) {
      return json({ error: 'comment_id required' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { data: comment, error: commentError } = await supabase
      .from('comments')
      .select('id, startup_id, user_email, author_name, content, created_at, owner_notified_at')
      .eq('id', comment_id)
      .single()

    if (commentError || !comment) {
      return json({ skipped: 'comment not found' })
    }
    if (comment.owner_notified_at) {
      return json({ skipped: 'already notified' })
    }

    const { data: startup, error: startupError } = await supabase
      .from('startups')
      .select('id, title, slug, plan, author, is_live, archived')
      .eq('id', comment.startup_id)
      .single()

    if (startupError || !startup) {
      return json({ skipped: 'startup not found' })
    }
    if (!startup.is_live || startup.archived) {
      return json({ skipped: 'startup not live' })
    }

    const ownerEmail = startup.author?.email
    if (!ownerEmail) {
      return json({ skipped: 'owner has no email' })
    }
    if (comment.user_email && comment.user_email.toLowerCase() === ownerEmail.toLowerCase()) {
      return json({ skipped: 'own comment' })
    }

    // Rate cap: how many owner notifications went out for this startup in the
    // last hour?
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { count: recentCount } = await supabase
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('startup_id', startup.id)
      .gte('owner_notified_at', oneHourAgo)

    if ((recentCount || 0) >= MAX_EMAILS_PER_STARTUP_PER_HOUR) {
      return json({ skipped: 'rate capped for this startup' })
    }

    const resendApiKey = Deno.env.get('RESEND_API_KEY')
    if (!resendApiKey) {
      return json({ skipped: 'no RESEND_API_KEY' })
    }

    const { count: totalComments } = await supabase
      .from('comments')
      .select('id', { count: 'exact', head: true })
      .eq('startup_id', startup.id)

    const emailSent = await sendCommentNotification(resendApiKey, {
      ownerEmail,
      ownerName: startup.author?.name,
      startupTitle: startup.title,
      startupUrl: `https://submithunt.com/startup/${startup.slug || startup.id}`,
      plan: startup.plan,
      commenterName: comment.author_name || 'Someone',
      commentText: comment.content || '',
      totalComments: totalComments || 1,
    })

    if (emailSent) {
      await supabase
        .from('comments')
        .update({ owner_notified_at: new Date().toISOString() })
        .eq('id', comment.id)
    }

    return json({ success: true, emailSent, startup: startup.title })
  } catch (error) {
    console.error('notify-comment error:', error)
    return json({ error: error.message, success: false }, 500)
  }
})

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    status,
  })
}

// Comment content and names are user-generated — escape before embedding in HTML.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

async function sendCommentNotification(resendApiKey: string, p: {
  ownerEmail: string
  ownerName?: string
  startupTitle: string
  startupUrl: string
  plan?: string
  commenterName: string
  commentText: string
  totalComments: number
}): Promise<boolean> {
  const isPaid = p.plan === 'premium' || p.plan === 'featured' || p.plan === 'pro' || p.plan === 'lite'
  const title = escapeHtml(p.startupTitle)
  const commenter = escapeHtml(p.commenterName)
  const commentHtml = escapeHtml(truncate(p.commentText, 600))
  const commentsUrl = `${p.startupUrl}#comments`

  // Free plans: a comment is proof of real interest — the natural moment to
  // pitch the upgrade. Paid plans get a clean notification, no pitch.
  const freeUpsellHtml = `
      <div style="background: #1a1a1a; border-radius: 8px; padding: 24px; margin: 25px 0;">
        <p style="margin: 0 0 6px 0; color: #f59e0b; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 1px;">While people are looking</p>
        <h3 style="margin: 0 0 10px 0; color: #fff; font-size: 20px; line-height: 1.3;">Interest like this fades when your listing leaves the homepage</h3>
        <p style="margin: 0 0 16px 0; color: #ccc; font-size: 14px; line-height: 1.6;">
          Free listings stay on the homepage for 7 days. Premium keeps ${title} there for 14 — twice the window for comments like this one to turn into users — and locks in a guaranteed dofollow backlink from our DR 38+ site.
        </p>
        <div style="text-align: center;">
          <a href="https://submithunt.com/pricing" style="display: inline-block; background-color: #f59e0b; color: #000; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">Upgrade to Premium — $20 one-time</a>
        </div>
      </div>`

  const emailData = {
    from: 'SubmitHunt <hello@submithunt.com>',
    to: [p.ownerEmail],
    subject: `${p.commenterName} commented on ${p.startupTitle}`,
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New comment on ${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f5f5f5;">
  <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; overflow: hidden; margin-top: 20px; margin-bottom: 20px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">

    <!-- Header -->
    <div style="background-color: #60a5fa; padding: 26px 30px; border-bottom: 4px solid #000;">
      <h1 style="margin: 0; color: #000; font-size: 22px; font-weight: bold;">New comment on ${title}</h1>
      <p style="margin: 6px 0 0 0; color: #1a1a1a; font-size: 14px;">People are engaging with your launch</p>
    </div>

    <!-- Main Content -->
    <div style="padding: 30px;">
      <p style="font-size: 16px; color: #333; margin: 0 0 20px 0; line-height: 1.6;">
        Hey ${escapeHtml(p.ownerName || 'there')},
      </p>

      <p style="font-size: 15px; color: #555; line-height: 1.6; margin: 0 0 16px 0;">
        <strong>${commenter}</strong> just left a comment on <strong>${title}</strong>:
      </p>

      <!-- Comment card -->
      <div style="background-color: #f8f9fa; border-left: 4px solid #60a5fa; border-radius: 0 8px 8px 0; padding: 16px 20px; margin: 0 0 20px 0;">
        <p style="margin: 0; color: #333; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${commentHtml}</p>
      </div>

      <div style="text-align: center; margin: 24px 0;">
        <a href="${commentsUrl}" style="display: inline-block; background-color: #000; color: #fff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">Reply to ${commenter}</a>
      </div>

      <p style="font-size: 14px; color: #666; line-height: 1.6; margin: 0;">
        Founders who reply within a few hours keep the thread alive — and listings with active threads get noticeably more upvotes and repeat visitors. ${p.totalComments > 1 ? `This is comment #${p.totalComments} on your listing.` : ''}
      </p>

      ${isPaid ? '' : freeUpsellHtml}
    </div>

    <!-- Footer -->
    <div style="background-color: #f8f9fa; padding: 20px; text-align: center; border-top: 1px solid #e9ecef;">
      <p style="margin: 0; color: #999; font-size: 12px;">
        <a href="https://submithunt.com" style="color: #60a5fa; text-decoration: none;">SubmitHunt</a> — Where founders launch and get discovered
      </p>
    </div>
  </div>
</body>
</html>
    `,
    text: `${p.commenterName} commented on ${p.startupTitle}

Hey ${p.ownerName || 'there'},

${p.commenterName} just left a comment on ${p.startupTitle}:

"${truncate(p.commentText, 600)}"

Reply here: ${commentsUrl}

Founders who reply within a few hours keep the thread alive — and listings with active threads get noticeably more upvotes and repeat visitors.
${isPaid ? '' : `
WHILE PEOPLE ARE LOOKING
Free listings stay on the homepage for 7 days. Premium keeps ${p.startupTitle} there for 14 — twice the window for comments like this one to turn into users — and locks in a guaranteed dofollow backlink from our DR 38+ site.

Upgrade to Premium ($20 one-time): https://submithunt.com/pricing
`}
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
  console.log('Comment notification sent:', await response.json())
  return true
}

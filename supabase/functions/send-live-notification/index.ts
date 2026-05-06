import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const supabaseUrl = Deno.env.get("SUPABASE_URL") as string;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") as string;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { startup_id, test_email } = await req.json();

    // Test mode - send a sample email directly
    if (test_email) {
      const testResult = await sendTestEmail(test_email);
      return new Response(
        JSON.stringify(testResult),
        { status: testResult.success ? 200 : 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!startup_id) {
      return new Response(
        JSON.stringify({ error: "startup_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch startup details
    const { data: startup, error: fetchError } = await supabase
      .from("startups")
      .select("*")
      .eq("id", startup_id)
      .single();

    if (fetchError || !startup) {
      console.error("Error fetching startup:", fetchError);
      return new Response(
        JSON.stringify({ error: "Startup not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get email from author field
    const authorEmail = startup.author?.email;
    if (!authorEmail) {
      console.log("No email found for startup:", startup_id);
      return new Response(
        JSON.stringify({ error: "No email found for startup author" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if notification was already sent
    if (startup.notification_sent) {
      console.log("Notification already sent for startup:", startup_id);
      return new Response(
        JSON.stringify({ message: "Notification already sent" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const startupUrl = `https://submithunt.com/startup/${startup.slug}`;
    const isPaid = startup.plan === 'premium' || startup.plan === 'featured' || startup.plan === 'pro' || startup.plan === 'lite';

    const shareText = encodeURIComponent(`I just launched ${startup.title} on @SubmitHunt! Check it out and give it an upvote 🚀`);

    // Create email HTML
    const emailHtml = `
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
    `;

    // Send email via Resend
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "SubmitHunt <hello@submithunt.com>",
        to: [authorEmail],
        subject: `${startup.title} is live \u2014 here's how to maximize your launch`,
        html: emailHtml,
      }),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      console.error("Resend API error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to send email", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const resendData = await resendResponse.json();
    console.log("Email sent successfully:", resendData);

    // Mark notification as sent
    const { error: updateError } = await supabase
      .from("startups")
      .update({ 
        notification_sent: true, 
        notification_sent_at: new Date().toISOString() 
      })
      .eq("id", startup_id);

    if (updateError) {
      console.error("Error updating notification status:", updateError);
    }

    return new Response(
      JSON.stringify({ success: true, emailId: resendData.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in send-live-notification:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function sendTestEmail(email: string) {
  const emailHtml = `
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
        Hey there! Great news!
      </p>
      
      <p style="font-size: 16px; color: #555; line-height: 1.6;">
        <strong>Test Startup</strong> is now live on SubmitHunt and visible to thousands of daily visitors!
      </p>
      
      <!-- Startup Card -->
      <div style="background-color: #f8f9fa; border: 2px solid #e9ecef; border-radius: 8px; padding: 20px; margin: 25px 0;">
        <h2 style="margin: 0 0 10px 0; color: #333; font-size: 20px;">Test Startup</h2>
        <p style="margin: 0; color: #666; font-size: 14px; line-height: 1.5;">This is a test email sent through the Edge Function to verify Resend integration.</p>
        <a href="https://submithunt.com" style="display: inline-block; margin-top: 15px; background-color: #000; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">View Your Listing →</a>
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
        <a href="https://twitter.com/intent/tweet" style="display: inline-block; margin-top: 15px; background-color: #000; color: #fff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 14px;">Share on X →</a>
      </div>
      
      <!-- Upgrade CTA -->
      <div style="background: linear-gradient(135deg, #f97316 0%, #ea580c 100%); border-radius: 8px; padding: 25px; margin: 25px 0; text-align: center;">
        <h3 style="margin: 0 0 10px 0; color: #fff; font-size: 20px;">🔥 Want More Visibility?</h3>
        <p style="margin: 0 0 15px 0; color: #fff; font-size: 14px; line-height: 1.5; opacity: 0.9;">
          Upgrade to Premium for just $20 and get:
        </p>
        <ul style="text-align: left; color: #fff; font-size: 14px; margin: 0 0 20px 0; padding-left: 20px;">
          <li style="margin-bottom: 8px;">✅ <strong>Guaranteed high authority backlink</strong></li>
          <li style="margin-bottom: 8px;">✅ 14 days on homepage (vs 7 days)</li>
          <li style="margin-bottom: 8px;">✅ Featured in our newsletter</li>
          <li style="margin-bottom: 8px;">✅ Skip the queue next time</li>
        </ul>
        <a href="https://submithunt.com/submit" style="display: inline-block; background-color: #fff; color: #ea580c; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-weight: bold;">Upgrade to Premium →</a>
      </div>
      
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
  `;

  try {
    const resendResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "SubmitHunt <hello@submithunt.com>",
        to: [email],
        subject: "🚀 Test Startup is now LIVE on SubmitHunt!",
        html: emailHtml,
      }),
    });

    if (!resendResponse.ok) {
      const errorText = await resendResponse.text();
      console.error("Resend API error:", errorText);
      return { success: false, error: errorText };
    }

    const resendData = await resendResponse.json();
    console.log("Test email sent successfully:", resendData);
    return { success: true, emailId: resendData.id };
  } catch (error) {
    console.error("Error sending test email:", error);
    return { success: false, error: error.message };
  }
}

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

    console.log("Checking notification status for all startups...")

    // Get all startups with their notification status
    const { data: startups, error: startupsError } = await supabase
      .from('startups')
      .select('id, title, slug, description, plan, author, launch_date, is_live, notification_sent, notification_sent_at, created_at')
      .eq('is_live', true)
      .order('created_at', { ascending: false })
      .limit(20)

    if (startupsError) {
      console.error('Error fetching startups:', startupsError)
      throw startupsError
    }

    console.log(`Found ${startups?.length || 0} live startups`)

    // Analyze notification status
    const analysis = {
      totalLiveStartups: startups?.length || 0,
      withEmails: 0,
      withoutEmails: 0,
      notificationsSent: 0,
      notificationsNotSent: 0,
      emailIssues: [] as any[],
      recentNotifications: [] as any[]
    }

    const detailedStatus = startups?.map(startup => {
      const hasEmail = !!startup.author?.email;
      const hasNotification = startup.notification_sent === true;
      const hasNotificationTime = !!startup.notification_sent_at;
      
      if (hasEmail) {
        analysis.withEmails++;
      } else {
        analysis.withoutEmails++;
        analysis.emailIssues.push({
          id: startup.id,
          title: startup.title,
          issue: 'No email address in author field',
          author: startup.author
        });
      }
      
      if (hasNotification) {
        analysis.notificationsSent++;
        if (startup.notification_sent_at) {
          const notificationDate = new Date(startup.notification_sent_at);
          const daysSinceNotification = Math.floor((new Date().getTime() - notificationDate.getTime()) / (1000 * 60 * 60 * 24));
          
          if (daysSinceNotification <= 7) {
            analysis.recentNotifications.push({
              id: startup.id,
              title: startup.title,
              email: startup.author?.email,
              notification_sent_at: startup.notification_sent_at,
              days_ago: daysSinceNotification
            });
          }
        }
      } else {
        analysis.notificationsNotSent++;
        if (hasEmail) {
          analysis.emailIssues.push({
            id: startup.id,
            title: startup.title,
            email: startup.author?.email,
            issue: 'Notification not sent but email available',
            created_at: startup.created_at,
            launch_date: startup.launch_date
          });
        }
      }
      
      return {
        id: startup.id,
        title: startup.title,
        email: startup.author?.email,
        plan: startup.plan,
        hasEmail,
        notificationSent: hasNotification,
        notificationSentAt: startup.notification_sent_at,
        hasNotificationTime,
        created_at: startup.created_at,
        launch_date: startup.launch_date
      };
    }) || [];

    return new Response(
      JSON.stringify({ 
        message: 'Notification status analysis completed',
        analysis,
        detailedStatus,
        success: true
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

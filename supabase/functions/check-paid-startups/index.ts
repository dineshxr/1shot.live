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

    console.log("Checking all paid startups...")

    // Find all paid startups (both live and not live)
    const { data: allPaidStartups, error: findError } = await supabase
      .from('startups')
      .select('id, title, slug, description, plan, author, launch_date, is_live, created_at')
      .in('plan', ['premium', 'featured'])
      .order('created_at', { ascending: false })

    if (findError) {
      console.error('Error finding paid startups:', findError)
      throw findError
    }

    console.log(`Found ${allPaidStartups?.length || 0} total paid startups`)

    // Also check payments table
    const { data: payments, error: paymentsError } = await supabase
      .from('payments')
      .select('*')
      .eq('status', 'completed')
      .order('created_at', { ascending: false })
      .limit(10)

    if (paymentsError) {
      console.error('Error finding payments:', paymentsError)
    } else {
      console.log(`Found ${payments?.length || 0} completed payments`)
    }

    return new Response(
      JSON.stringify({ 
        message: `Found ${allPaidStartups?.length || 0} paid startups and ${payments?.length || 0} completed payments`,
        paidStartups: allPaidStartups || [],
        recentPayments: payments || [],
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

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

    console.log("Setting up PST timezone for database...")

    // Check current timezone settings
    const { data: currentTimezone, error: timezoneError } = await supabase
      .rpc('get_current_timezone')

    if (timezoneError) {
      console.error('Error getting current timezone:', timezoneError)
    } else {
      console.log('Current timezone:', currentTimezone)
    }

    // Get current database time
    const { data: dbTime, error: timeError } = await supabase
      .rpc('get_database_time')

    if (timeError) {
      console.error('Error getting database time:', timeError)
    } else {
      console.log('Database time:', dbTime)
    }

    // Set timezone to PST
    const { data: setTimezone, error: setTimeError } = await supabase
      .rpc('set_timezone_to_pst')

    if (setTimeError) {
      console.error('Error setting timezone:', setTimeError)
    } else {
      console.log('Timezone set to PST:', setTimezone)
    }

    // Verify timezone change
    const { data: newTimezone, error: newTimezoneError } = await supabase
      .rpc('get_current_timezone')

    if (newTimezoneError) {
      console.error('Error getting new timezone:', newTimezoneError)
    } else {
      console.log('New timezone:', newTimezone)
    }

    // Get new database time
    const { data: newDbTime, error: newTimeError } = await supabase
      .rpc('get_database_time')

    if (newTimeError) {
      console.error('Error getting new database time:', newTimeError)
    } else {
      console.log('New database time:', newDbTime)
    }

    // Get PST time for comparison
    const now = new Date()
    const pstTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Los_Angeles"}))
    console.log('System PST time:', pstTime.toISOString())

    return new Response(
      JSON.stringify({ 
        message: 'PST timezone setup completed',
        previousTimezone: currentTimezone,
        newTimezone: newTimezone,
        previousDbTime: dbTime,
        newDbTime: newDbTime,
        systemPstTime: pstTime.toISOString(),
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

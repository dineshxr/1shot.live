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

    console.log("Testing PST timezone alignment...")

    // Get current time in multiple timezones for comparison
    const now = new Date()
    const utcTime = now.toISOString()
    const pstTime = new Date(now.toLocaleString("en-US", {timeZone: "America/Los_Angeles"}))
    const estTime = new Date(now.toLocaleString("en-US", {timeZone: "America/New_York"}))
    
    // Get date strings in different formats
    const pstDate = pstTime.toLocaleDateString('en-CA', { timeZone: 'America/Los_Angeles' })
    const estDate = estTime.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const utcDate = utcTime.split('T')[0]
    
    // Get hours in different timezones
    const pstHour = pstTime.getHours()
    const estHour = estTime.getHours()
    const utcHour = now.getUTCHours()
    
    // Get weekdays in different timezones
    const pstWeekday = pstTime.toLocaleDateString('en-US', { 
      timeZone: 'America/Los_Angeles', 
      weekday: 'long' 
    })
    const estWeekday = estTime.toLocaleDateString('en-US', { 
      timeZone: 'America/New_York', 
      weekday: 'long' 
    })
    const utcWeekday = now.toLocaleDateString('en-US', { 
      timeZone: 'UTC', 
      weekday: 'long' 
    })

    // Test database timezone functions if they exist
    let dbTimezone = 'Unknown'
    let dbTime = 'Unknown'
    let dbPstDate = 'Unknown'
    let dbPstHour = 'Unknown'
    
    try {
      const { data: timezone } = await supabase.rpc('get_current_timezone')
      dbTimezone = timezone || 'Unknown'
    } catch (e) {
      console.log('Database timezone functions not available')
    }
    
    try {
      const { data: time } = await supabase.rpc('get_database_time')
      dbTime = time ? new Date(time).toISOString() : 'Unknown'
    } catch (e) {
      console.log('Database time function not available')
    }
    
    try {
      const { data: pstDateDb } = await supabase.rpc('get_pst_date')
      dbPstDate = pstDateDb || 'Unknown'
    } catch (e) {
      console.log('Database PST date function not available')
    }
    
    try {
      const { data: pstHourDb } = await supabase.rpc('get_pst_hour')
      dbPstHour = pstHourDb?.toString() || 'Unknown'
    } catch (e) {
      console.log('Database PST hour function not available')
    }

    const results = {
      system: {
        utc: {
          time: utcTime,
          date: utcDate,
          hour: utcHour,
          weekday: utcWeekday
        },
        pst: {
          time: pstTime.toISOString(),
          date: pstDate,
          hour: pstHour,
          weekday: pstWeekday
        },
        est: {
          time: estTime.toISOString(),
          date: estDate,
          hour: estHour,
          weekday: estWeekday
        }
      },
      database: {
        timezone: dbTimezone,
        time: dbTime,
        pstDate: dbPstDate,
        pstHour: dbPstHour
      },
      alignment: {
        pstDateMatches: pstDate === dbPstDate,
        pstHourMatches: pstHour.toString() === dbPstHour,
        isAfter8amPst: pstHour >= 8,
        isWeekdayPst: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].includes(pstWeekday)
      }
    }

    console.log("PST Alignment Test Results:", JSON.stringify(results, null, 2))

    return new Response(
      JSON.stringify({ 
        message: 'PST timezone alignment test completed',
        results,
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

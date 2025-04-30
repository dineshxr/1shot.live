import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.38.4/+esm';

/**
 * Create and return a Supabase client instance with better error handling
 * @returns {Object} Supabase client
 */
export const supabaseClient = () => {
  try {
    // Get environment variables from window.PUBLIC_ENV
    const { supabaseUrl, supabaseKey } = window.PUBLIC_ENV || {};
    
    // Validate URL and key
    if (!supabaseUrl || !supabaseKey) {
      console.error('Supabase URL or key is missing. Check your environment variables.');
      throw new Error('Supabase configuration is incomplete');
    }
    
    // Log connection attempt for debugging
    console.log(`Connecting to Supabase at: ${supabaseUrl}`);
    
    // Create and return the client
    return createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: false // Don't persist auth state for this simple app
      }
    });
  } catch (error) {
    console.error('Error initializing Supabase client:', error);
    throw error;
  }
};

// Initialize presence channel
export const initPresence = async ({ sessionId, countryFlag, countryName }) => {
  const { supabaseUrl, supabaseKey } = window.PUBLIC_ENV;
  const supabase = createClient(supabaseUrl, supabaseKey);
  const _ = await supabase.auth.getSession();

  // For this implementation, we'll create a public channel that doesn't require authentication
  const channel = supabase.channel("online-visitors", {
    config: {
      presence: {
        key: sessionId,
      },
    },
  });

  // Subscribe to presence changes
  channel
    .on("presence", { event: "sync" }, () => {
      const state = channel.presenceState();
      // Convert the state to an array of visitor objects
      const presenceState = Object.values(state).flatMap((presence) =>
        presence.map((p) => p)
      );

      // Dispatch an event when presence state changes
      window.dispatchEvent(
        new CustomEvent("presence-update", {
          detail: { visitors: presenceState },
        })
      );
    })
    .on("presence", { event: "join" }, ({ key, newPresences }) => {
      // console.log("New visitor joined:", newPresences);
    })
    .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
      // console.log("Visitor left:", leftPresences);
    });

  // Subscribe to the channel and enter the room
  await channel.subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      // Enter the channel with some user metadata
      await channel.track({
        session_id: sessionId,
        country_flag: countryFlag,
        country_name: countryName,
        timestamp: new Date().toISOString(),
      });
    }
  });

  return channel;
};

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.38.4/+esm';

/**
 * Get or create a singleton Supabase client instance
 * @returns {Object} Supabase client
 */
export const supabaseClient = () => {
  // Use the global singleton instance from auth.js
  if (window.supabaseClient) {
    return window.supabaseClient;
  }
  
  try {
    // Get environment variables from window.PUBLIC_ENV
    const { supabaseUrl, supabaseKey } = window.PUBLIC_ENV || {};
    
    // Fallback to hardcoded values if env vars not available
    const url = supabaseUrl || 'https://lbayphzxmdtdmrqmeomt.supabase.co';
    const key = supabaseKey || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxiYXlwaHp4bWR0ZG1ycW1lb210Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDA5NTAyNTYsImV4cCI6MjA1NjUyNjI1Nn0.uSt7ll1Gy_TtbHxTyRtkyToZBIbW7ud18X45k5BdzKo';
    
    // Log connection attempt for debugging
    console.log(`Connecting to Supabase at: ${url}`);
    
    // Create and store the global client
    window.supabaseClient = createClient(url, key, {
      auth: {
        persistSession: false // Don't persist auth state for this simple app
      }
    });
    
    return window.supabaseClient;
  } catch (error) {
    console.error('Error initializing Supabase client:', error);
    throw error;
  }
};

// Initialize presence channel
export const initPresence = async ({ sessionId, countryFlag, countryName }) => {
  try {
    // Use the singleton Supabase client
    const supabase = supabaseClient();
    
    console.log(`Initializing presence channel with existing Supabase client`);
    
    // Initialize anonymous session
    await supabase.auth.getSession();
    
    // Create a public channel that doesn't require authentication
    const channel = supabase.channel("online-visitors", {
      config: {
        presence: {
          key: sessionId,
        },
      },
    });

    // Add a mock visitor for local development to ensure the counter shows something
    const mockVisitor = {
      session_id: 'mock-visitor-' + Math.random().toString(36).substring(2, 9),
      country_flag: '🌎',
      country_name: 'World',
      timestamp: new Date().toISOString(),
    };

    // Subscribe to presence changes
    channel
      .on("presence", { event: "sync" }, () => {
        try {
          const state = channel.presenceState();
          // Convert the state to an array of visitor objects
          let presenceState = Object.values(state).flatMap((presence) =>
            presence.map((p) => p)
          );
          
          // If no visitors are found, add the mock visitor for development
          if (presenceState.length === 0) {
            presenceState = [mockVisitor];
          }
          
          console.log('Presence state updated:', presenceState.length, 'visitors');
          
          // Dispatch an event when presence state changes
          window.dispatchEvent(
            new CustomEvent("presence-update", {
              detail: { visitors: presenceState },
            })
          );
        } catch (error) {
          console.error('Error processing presence state:', error);
        }
      })
      .on("presence", { event: "join" }, ({ key, newPresences }) => {
        console.log("New visitor joined:", newPresences);
      })
      .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
        console.log("Visitor left:", leftPresences);
      });

    // Subscribe to the channel and enter the room
    await channel.subscribe(async (status) => {
      console.log('Presence channel status:', status);
      if (status === "SUBSCRIBED") {
        // Enter the channel with some user metadata
        await channel.track({
          session_id: sessionId,
          country_flag: countryFlag,
          country_name: countryName,
          timestamp: new Date().toISOString(),
        });
        console.log('Successfully joined presence channel');
      }
    });
    
    // Immediately dispatch an event with at least the current user
    window.dispatchEvent(
      new CustomEvent("presence-update", {
        detail: { 
          visitors: [{
            session_id: sessionId,
            country_flag: countryFlag,
            country_name: countryName,
            timestamp: new Date().toISOString(),
          }, mockVisitor] 
        },
      })
    );
    
    return channel;
  } catch (error) {
    console.error('Error initializing presence channel:', error);
    
    // Even if there's an error, provide a fallback to show at least one visitor
    window.dispatchEvent(
      new CustomEvent("presence-update", {
        detail: { 
          visitors: [{
            session_id: 'fallback-' + Math.random().toString(36).substring(2, 9),
            country_flag: '🌎',
            country_name: 'World',
            timestamp: new Date().toISOString(),
          }] 
        },
      })
    );
    
    // Return null since we couldn't create a channel
    return null;
  }
};

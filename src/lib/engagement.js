import { supabaseClient } from './supabase-client.js';

// Per-session "the user actually opened this product's website" flags, used to
// gate first-time upvotes behind a visit (see HowToUpvoteModal). sessionStorage
// on purpose: a visit should be recent, not remembered forever.
const visitKey = (startupId) => `sh_visited_${startupId}`;

export const hasVisited = (startupId) => {
  try {
    return sessionStorage.getItem(visitKey(startupId)) === '1';
  } catch (e) {
    return false;
  }
};

export const markVisited = (startupId) => {
  try {
    sessionStorage.setItem(visitKey(startupId), '1');
  } catch (e) { /* ignore (private mode / storage denied) */ }
};

// Cast (or toggle) an upvote. Shared by UpvoteButton and HowToUpvoteModal so
// both paths hit the same RPC the same way. Resolves to {upvote_count,
// user_voted}; throws an Error with a user-presentable message otherwise.
export const castUpvote = async (startup) => {
  const supabase = supabaseClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || !session.user) {
    throw new Error('Please log in to upvote');
  }

  const { data, error } = await supabase.rpc('upvote_startup', {
    startup_id_param: startup.id,
    user_email_param: session.user.email
  });
  if (error) throw error;
  if (data && data.error) throw new Error(data.error); // e.g. daily vote limit
  return data;
};

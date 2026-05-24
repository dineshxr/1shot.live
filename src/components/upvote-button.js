/* global html, useState, useEffect */
import { supabaseClient } from "../lib/supabase-client.js";

export const UpvoteButton = ({ startup, user, onUpvoteChange }) => {
  const [isVoting, setIsVoting] = useState(false);
  const [upvoteCount, setUpvoteCount] = useState(startup.upvote_count || 0);
  const [userVoted, setUserVoted] = useState(startup.user_voted || false);

  const handleUpvote = async (e) => {
    // Prevent event propagation to avoid navigation
    e.preventDefault();
    e.stopPropagation();

    if (!user) {
      // Trigger login modal using the same method as submit form
      const loginEvent = new CustomEvent('open-login-modal');
      window.dispatchEvent(loginEvent);
      return;
    }

    if (isVoting) return;

    setIsVoting(true);
    
    try {
      const supabase = supabaseClient();
      
      // Check if we have a user session
      const { data: { session } } = await supabase.auth.getSession();
      console.log('Current session:', session);
      
      if (!session || !session.user) {
        alert('Please log in to upvote');
        return;
      }
      
      const { data, error } = await supabase.rpc('upvote_startup', {
        startup_id_param: startup.id,
        user_email_param: session.user.email
      });

      if (error) throw error;

      // Check for daily limit error
      if (data.error) {
        alert(data.error);
        return;
      }

      setUpvoteCount(data.upvote_count);
      setUserVoted(data.user_voted);
      
      // Notify parent component of the change
      if (onUpvoteChange) {
        onUpvoteChange(startup.id, data.upvote_count, data.user_voted);
      }

    } catch (error) {
      console.error('Error upvoting:', error);
      console.error('Error details:', JSON.stringify(error, null, 2));
      console.error('Startup ID:', startup.id);
      console.error('User:', user);
      alert(`Failed to upvote: ${error.message || 'Unknown error'}. Please try again.`);
    } finally {
      setIsVoting(false);
    }
  };

  return html`
    <button
      onclick=${handleUpvote}
      disabled=${isVoting}
      class="flex flex-col items-center justify-center gap-0.5 min-w-[52px] px-2 py-1.5 rounded-xl border transition-colors ${
        userVoted
          ? 'border-orange-300 bg-orange-50 text-orange-700 hover:bg-orange-100'
          : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50'
      } ${isVoting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}"
      title=${user ? (userVoted ? 'Remove upvote' : 'Upvote this startup') : 'Login to upvote'}
    >
      <svg
        class="w-3.5 h-3.5"
        fill=${userVoted ? 'currentColor' : 'none'}
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          stroke-linecap="round"
          stroke-linejoin="round"
          stroke-width="2.5"
          d="M5 15l7-7 7 7"
        />
      </svg>
      <span class="text-xs font-semibold tabular-nums leading-none">${upvoteCount}</span>
    </button>
  `;
};

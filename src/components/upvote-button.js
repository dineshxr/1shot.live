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
      const { data, error } = await supabase.rpc('upvote_startup', {
        startup_id_param: startup.id
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
      alert('Failed to upvote. Please try again.');
    } finally {
      setIsVoting(false);
    }
  };

  return html`
    <button
      onclick=${handleUpvote}
      disabled=${isVoting}
      class="flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all duration-200 ${
        userVoted 
          ? 'border-orange-500 bg-orange-50 text-orange-700 hover:bg-orange-100' 
          : 'border-gray-300 bg-white text-gray-600 hover:border-orange-300 hover:bg-orange-50'
      } ${isVoting ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}"
      title=${user ? (userVoted ? 'Remove upvote' : 'Upvote this startup') : 'Login to upvote'}
    >
      <svg 
        class="w-5 h-5 ${userVoted ? 'text-orange-500' : 'text-gray-400'}" 
        fill=${userVoted ? 'currentColor' : 'none'} 
        stroke="currentColor" 
        viewBox="0 0 24 24"
      >
        <path 
          stroke-linecap="round" 
          stroke-linejoin="round" 
          stroke-width="2" 
          d="M5 15l7-7 7 7"
        />
      </svg>
      <span class="font-medium">${upvoteCount}</span>
    </button>
  `;
};

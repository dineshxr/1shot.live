import { supabaseClient } from '../lib/supabase-client.js';
import { trackEvent } from '../lib/events.js';

/* global html, useState, useEffect */

const COMMENT_MIN_LENGTH = 5;
const COMMENT_MAX_LENGTH = 1000;

const timeAgo = (iso) => {
  try {
    const seconds = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(iso).toLocaleDateString();
  } catch (e) {
    return '';
  }
};

export const CommentSection = ({ startup, user }) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [content, setContent] = useState('');
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    const fetchComments = async () => {
      setLoading(true);
      try {
        const supabase = supabaseClient();
        const { data, error: fetchError } = await supabase
          .from('comments')
          .select('id, author_name, author_avatar, content, created_at')
          .eq('startup_id', startup.id)
          .order('created_at', { ascending: false });
        if (cancelled) return;
        if (fetchError) {
          console.warn('Could not load comments:', fetchError);
          setLoadError(true);
        } else {
          setComments(data || []);
        }
      } catch (e) {
        if (!cancelled) setLoadError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchComments();
    return () => { cancelled = true; };
  }, [startup.id]);

  const handlePost = async (e) => {
    e.preventDefault();

    if (!user) {
      window.dispatchEvent(new CustomEvent('open-login-modal'));
      return;
    }

    const trimmed = content.trim();
    if (trimmed.length < COMMENT_MIN_LENGTH) {
      setError(`Comments need at least ${COMMENT_MIN_LENGTH} characters.`);
      return;
    }
    if (trimmed.length > COMMENT_MAX_LENGTH) {
      setError(`Comments are limited to ${COMMENT_MAX_LENGTH} characters.`);
      return;
    }

    setPosting(true);
    setError(null);
    try {
      const supabase = supabaseClient();
      const { data, error: rpcError } = await supabase.rpc('add_comment', {
        startup_id_param: startup.id,
        content_param: trimmed
      });
      if (rpcError) throw rpcError;
      if (data && data.error) {
        setError(data.error);
        return;
      }
      if (data && data.comment) {
        setComments(prev => [data.comment, ...prev]);
        setContent('');
        trackEvent('comment_posted', { startupId: startup.id, startupName: startup.title });
      }
    } catch (err) {
      console.error('Error posting comment:', err);
      setError('Could not post your comment. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  return html`
    <div class="border-t-2 border-black pt-4 mt-6">
      <h2 class="text-xl font-bold mb-1">Comments${comments.length > 0 ? ` (${comments.length})` : ''}</h2>
      <p class="text-sm text-gray-600 mb-4">
        Genuine feedback helps the maker — and introduces you to the community.
      </p>

      <form onSubmit=${handlePost} class="mb-6">
        <textarea
          value=${content}
          onInput=${(e) => setContent(e.target.value)}
          rows="3"
          maxlength=${COMMENT_MAX_LENGTH}
          placeholder=${user
            ? `What do you think of ${startup.title}?`
            : 'Sign in to join the conversation'}
          class="w-full px-3 py-2 border-2 border-black rounded focus:outline-none focus:ring-2 focus:ring-blue-400 text-sm"
        ></textarea>
        ${error && html`<p class="text-sm text-red-600 mt-1">${error}</p>`}
        <div class="flex justify-end mt-2">
          <button
            type="submit"
            disabled=${posting}
            class="bg-black text-white px-5 py-2 rounded font-bold text-sm hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ${posting ? 'Posting…' : (user ? 'Post comment' : 'Sign in to comment')}
          </button>
        </div>
      </form>

      ${loading ? html`
        <p class="text-sm text-gray-500">Loading comments…</p>
      ` : loadError ? html`
        <p class="text-sm text-gray-500">Comments couldn't be loaded right now.</p>
      ` : comments.length === 0 ? html`
        <p class="text-sm text-gray-500">No comments yet — be the first to share your thoughts.</p>
      ` : html`
        <div class="space-y-4">
          ${comments.map((comment) => html`
            <div key=${comment.id} class="flex items-start gap-3">
              ${comment.author_avatar ? html`
                <img
                  src=${comment.author_avatar}
                  alt=${comment.author_name || 'User'}
                  class="w-8 h-8 rounded-full border border-black shrink-0 object-cover"
                  onError=${(e) => { e.target.style.display = 'none'; }}
                />
              ` : html`
                <div class="w-8 h-8 rounded-full border border-black bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-600 shrink-0">
                  ${(comment.author_name || '?').charAt(0).toUpperCase()}
                </div>
              `}
              <div class="flex-1 min-w-0">
                <div class="flex items-baseline gap-2 flex-wrap">
                  <span class="font-bold text-sm">${comment.author_name || 'Anonymous'}</span>
                  <span class="text-xs text-gray-400">${timeAgo(comment.created_at)}</span>
                </div>
                <p class="text-sm text-gray-800 mt-0.5 whitespace-pre-wrap break-words">${comment.content}</p>
              </div>
            </div>
          `)}
        </div>
      `}
    </div>
  `;
};

import { supabaseClient } from '../lib/supabase-client.js';
import { castUpvote, hasVisited, markVisited } from '../lib/engagement.js';
import { addReferralParam } from '../lib/url-utils.js';
import { trackEvent } from '../lib/events.js';

/* global html, useState, useEffect */

// In-flow unlock helper for the submit page: lists products the signed-in
// maker can upvote WITHOUT leaving the form. Same rules as the feed — visit
// the product first, then the upvote unlocks — and the same RPC via
// castUpvote(). Own products and already-upvoted ones are excluded (a second
// click on a voted product would TOGGLE the vote off, and self-votes don't
// count toward the unlock).
//
// `done`/`required` come from the parent's freeStatus, so progress here always
// matches the checklist behind the modal; parent passes onVoted to re-pull it.
export const UpvoteProductsModal = ({ isOpen, onClose, userEmail, done, required, onVoted }) => {
  const [products, setProducts] = useState(null); // null = loading
  const [loadError, setLoadError] = useState(null);
  const [votingId, setVotingId] = useState(null);
  const [sessionVoted, setSessionVoted] = useState({});   // id -> true (voted from this dialog)
  const [visitedTick, setVisitedTick] = useState(0);      // re-render after markVisited (sessionStorage)
  const [rowError, setRowError] = useState(null);         // { id, message }

  const complete = (done || 0) >= (required || 3);

  // Load candidates when the dialog opens.
  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    trackEvent('unlock_upvote_modal_open', {});
    (async () => {
      setProducts(null);
      setLoadError(null);
      setRowError(null);
      try {
        const supabase = supabaseClient();
        const [listRes, upvotedRes] = await Promise.all([
          supabase
            .from('startups')
            .select('id, title, tagline, description, url, slug, logo_url, author')
            .eq('is_live', true)
            .order('created_at', { ascending: false })
            .limit(40),
          supabase.rpc('get_user_upvoted_startups'),
        ]);
        if (cancelled) return;
        if (listRes.error) throw listRes.error;
        const alreadyUpvoted = new Set(((upvotedRes && upvotedRes.data) || []).map((r) => r.id));
        const mine = String(userEmail || '').toLowerCase();
        const candidates = (listRes.data || [])
          .filter((s) => String((s.author && s.author.email) || '').toLowerCase() !== mine)
          .filter((s) => !alreadyUpvoted.has(s.id))
          .slice(0, 12);
        setProducts(candidates);
      } catch (e) {
        console.error('Failed to load products to upvote:', e);
        if (!cancelled) setLoadError('Could not load products. Please try again.');
      }
    })();
    return () => { cancelled = true; };
  }, [isOpen]);

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // Once the requirement is met, show the success beat briefly, then close so
  // the unlocked panel (launch-date picker) is revealed underneath.
  useEffect(() => {
    if (!isOpen || !complete) return undefined;
    const t = setTimeout(onClose, 1600);
    return () => clearTimeout(t);
  }, [isOpen, complete]);

  if (!isOpen) return null;

  const handleVisit = (startup) => {
    markVisited(startup.id);
    setVisitedTick((n) => n + 1);
    trackEvent('unlock_upvote_visit', { startupId: startup.id });
    window.open(addReferralParam(startup.url), '_blank', 'noopener,noreferrer');
  };

  const handleUpvote = async (startup) => {
    if (votingId || sessionVoted[startup.id]) return;
    setVotingId(startup.id);
    setRowError(null);
    try {
      await castUpvote(startup);
      setSessionVoted((prev) => ({ ...prev, [startup.id]: true }));
      trackEvent('upvote_cast', { startupId: startup.id, source: 'unlock_modal' });
      if (onVoted) await onVoted(); // parent re-pulls freeStatus → progress ticks
    } catch (e) {
      setRowError({ id: startup.id, message: e.message || 'Failed to upvote. Please try again.' });
    } finally {
      setVotingId(null);
    }
  };

  const doneShown = Math.min(done || 0, required || 3);

  return html`
    <div
      class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
      onClick=${(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}
    >
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh]" onClick=${(e) => e.stopPropagation()}>
        <div class="flex items-start gap-4 px-6 pt-6 pb-5 bg-gradient-to-b from-emerald-50/70 to-white shrink-0">
          <div class="w-11 h-11 rounded-xl bg-white border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
            <i class="fas fa-arrow-up"></i>
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-lg font-semibold text-gray-900">Upvote ${required || 3} products</h3>
            <p class="text-sm text-gray-500 mt-0.5">Open a product to check it out, then cast your upvote — right from here.</p>
            <div class="flex items-center gap-3 mt-3">
              <div class="flex-1 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                <div class="h-full bg-emerald-500 transition-all" style="width: ${Math.round((doneShown / (required || 3)) * 100)}%"></div>
              </div>
              <span class="text-sm font-semibold text-gray-700 tabular-nums">${doneShown}/${required || 3}</span>
            </div>
          </div>
          <button
            type="button"
            onClick=${onClose}
            class="text-gray-400 hover:text-gray-600 transition-colors p-1 -mr-1"
            aria-label="Close"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        </div>

        ${complete ? html`
          <div class="mx-6 mb-5 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-3">
            <i class="fas fa-circle-check text-emerald-600"></i>
            <p class="text-sm text-emerald-800 font-medium">All set — your free launch is unlocked!</p>
          </div>
        ` : html`
          <div class="border-t border-gray-100 overflow-y-auto">
            ${products === null && !loadError ? html`
              <div class="text-center py-10">
                <div class="inline-block animate-spin rounded-full h-6 w-6 border-2 border-gray-300 border-t-gray-900"></div>
                <p class="text-sm text-gray-500 mt-2">Loading products…</p>
              </div>
            ` : ''}
            ${loadError ? html`<p class="text-sm text-red-600 px-6 py-6">${loadError}</p>` : ''}
            ${products !== null && !loadError && products.length === 0 ? html`
              <p class="text-sm text-gray-500 px-6 py-6">Nothing new to upvote right now — browse the <a href="/" target="_blank" rel="noopener" class="underline font-medium text-gray-700">homepage</a> to find more products.</p>
            ` : ''}
            ${(products || []).map((s) => {
    const visited = hasVisited(s.id);
    const voted = !!sessionVoted[s.id];
    const busy = votingId === s.id;
    return html`
              <div class="px-5 sm:px-6 py-3.5 border-b border-gray-100 last:border-b-0">
                <div class="flex items-center gap-3">
                  ${s.logo_url ? html`
                    <img src=${s.logo_url} alt="" class="w-9 h-9 rounded-lg border border-gray-200 object-cover shrink-0" onError=${(e) => { e.target.style.display = 'none'; }} />
                  ` : html`
                    <div class="w-9 h-9 rounded-lg border border-gray-200 bg-gray-50 text-gray-500 text-sm font-semibold flex items-center justify-center shrink-0">${(s.title || '?').charAt(0).toUpperCase()}</div>
                  `}
                  <div class="flex-1 min-w-0">
                    <p class="font-semibold text-gray-900 text-sm truncate">${s.title}</p>
                    <p class="text-xs text-gray-500 truncate">${s.tagline || s.description || ''}</p>
                  </div>
                  <button
                    type="button"
                    onClick=${() => handleVisit(s)}
                    class="shrink-0 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors flex items-center gap-1.5 ${visited
      ? 'border-gray-200 text-gray-500 hover:bg-gray-50'
      : 'border-gray-300 text-gray-800 hover:bg-gray-50'}"
                  >
                    <i class="fas fa-arrow-up-right-from-square text-[10px]"></i> ${visited ? 'Visited' : 'Visit'}
                  </button>
                  <button
                    type="button"
                    onClick=${() => handleUpvote(s)}
                    disabled=${!visited || voted || busy}
                    title=${voted ? 'Upvoted' : (visited ? 'Cast your upvote' : 'Visit the product first')}
                    class="shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${voted
      ? 'bg-emerald-50 border border-emerald-200 text-emerald-700 cursor-default'
      : (visited ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed')}"
                  >
                    ${voted
      ? html`<i class="fas fa-check text-[10px]"></i> Upvoted`
      : (busy
        ? html`<i class="fas fa-spinner fa-spin text-[10px]"></i> Upvoting…`
        : html`<i class="fas fa-arrow-up text-[10px]"></i> Upvote`)}
                  </button>
                </div>
                ${rowError && rowError.id === s.id ? html`<p class="text-xs text-red-600 mt-1.5 pl-12">${rowError.message}</p>` : ''}
              </div>
    `;
  })}
          </div>
          <div class="px-6 py-3.5 border-t border-gray-100 bg-gray-50/60 shrink-0">
            <p class="text-xs text-gray-500">Visit a product first — its Upvote button unlocks after. Your progress updates automatically.</p>
          </div>
        `}
      </div>
    </div>
  `;
};

import { castUpvote, hasVisited, markVisited } from '../lib/engagement.js';
import { addReferralParam } from '../lib/url-utils.js';
import { trackEvent, ANALYTICS_EVENTS } from '../lib/events.js';

/* global html, useState, useEffect */

// "How to upvote" guide shown before a first-time upvote: the user must open
// the product's website before the Upvote button unlocks. Opened via the
// 'open-upvote-guide' window event (mounted globally in app.js, like the
// login modal).
export const HowToUpvoteModal = ({ isOpen, startup, onClose, onUpvoted }) => {
  const [visited, setVisited] = useState(false);
  const [isVoting, setIsVoting] = useState(false);
  const [error, setError] = useState(null);

  // Re-sync per startup whenever the dialog opens.
  useEffect(() => {
    if (isOpen && startup) {
      setVisited(hasVisited(startup.id));
      setError(null);
      trackEvent('upvote_guide_open', { startupId: startup.id, startupName: startup.title });
    }
  }, [isOpen, startup && startup.id]);

  // Close on Escape (without the login modal's redirect-to-home behavior).
  useEffect(() => {
    if (!isOpen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !startup) return null;

  const handleVisit = () => {
    markVisited(startup.id);
    setVisited(true);
    trackEvent(ANALYTICS_EVENTS.LINK_CLICK, {
      startupId: startup.id,
      startupName: startup.title,
      startupUrl: startup.url,
      source: 'upvote_guide'
    });
    window.open(addReferralParam(startup.url), '_blank', 'noopener,noreferrer');
  };

  const handleUpvote = async () => {
    if (!visited || isVoting) return;
    setIsVoting(true);
    setError(null);
    try {
      const data = await castUpvote(startup);
      trackEvent('upvote_cast', { startupId: startup.id, source: 'upvote_guide' });
      if (onUpvoted) onUpvoted(data);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to upvote. Please try again.');
    } finally {
      setIsVoting(false);
    }
  };

  const steps = [
    {
      icon: html`
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M12 21a9 9 0 100-18 9 9 0 000 18zm0-18c2.5 2.4 3.9 5.6 3.9 9s-1.4 6.6-3.9 9m0-18c-2.5 2.4-3.9 5.6-3.9 9s1.4 6.6 3.9 9M3.5 9h17M3.5 15h17"/>
        </svg>
      `,
      iconClass: 'bg-blue-50 border-blue-100 text-blue-600',
      title: 'Visit the product',
      description: html`Check out <strong class="text-gray-900">${startup.title}</strong>'s website to see what they've built.`,
      done: visited,
      number: 1,
    },
    {
      icon: html`
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M9 14l-4-4 4-4m-4 4h11a4 4 0 010 8h-1"/>
        </svg>
      `,
      iconClass: 'bg-amber-50 border-amber-100 text-amber-500',
      title: 'Come back here',
      description: 'After exploring, return to this page. This dialog stays open.',
      done: visited,
      number: 2,
    },
    {
      icon: html`
        <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/>
        </svg>
      `,
      iconClass: 'bg-emerald-50 border-emerald-100 text-emerald-600',
      title: 'Cast your upvote',
      description: 'Click the upvote button below to show your support.',
      done: false,
      number: 3,
    },
  ];

  return html`
    <div
      class="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50"
      onClick=${(e) => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}
    >
      <div class="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick=${(e) => e.stopPropagation()}>
        <div class="flex items-start gap-4 px-6 pt-6 pb-5 bg-gradient-to-b from-emerald-50/70 to-white">
          <div class="w-11 h-11 rounded-xl bg-white border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M14 9V5a3 3 0 00-3-3l-4 9v11h11.28a2 2 0 002-1.7l1.38-9a2 2 0 00-2-2.3H14zM7 22H4a2 2 0 01-2-2v-7a2 2 0 012-2h3"/>
            </svg>
          </div>
          <div class="flex-1 min-w-0">
            <h3 class="text-lg font-semibold text-gray-900">How to upvote</h3>
            <p class="text-sm text-gray-500 mt-0.5">Explore the product first, then cast your vote.</p>
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

        <div class="divide-y divide-gray-100 border-t border-gray-100">
          ${steps.map((step) => html`
            <div class="flex items-start gap-4 px-6 py-4">
              <div class="w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${step.iconClass}">
                ${step.icon}
              </div>
              <div class="flex-1 min-w-0">
                <p class="font-semibold text-gray-900 text-sm">${step.title}</p>
                <p class="text-sm text-gray-500 mt-0.5">${step.description}</p>
              </div>
              ${step.done ? html`
                <span class="w-6 h-6 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center shrink-0 mt-1">
                  <svg class="w-3 h-3" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7"/>
                  </svg>
                </span>
              ` : html`
                <span class="w-6 h-6 rounded-full bg-gray-50 border border-gray-200 text-gray-500 text-xs font-medium flex items-center justify-center shrink-0 mt-1">
                  ${step.number}
                </span>
              `}
            </div>
          `)}
        </div>

        ${error && html`
          <div class="px-6 pb-1">
            <p class="text-sm text-red-600">${error}</p>
          </div>
        `}

        <div class="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100">
          <button type="button" onClick=${onClose} class="px-4 py-2 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
            Close
          </button>
          <button
            type="button"
            onClick=${handleVisit}
            class="px-4 py-2 rounded-xl bg-gray-900 text-white text-sm font-medium hover:bg-gray-800 transition-colors flex items-center gap-2"
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
            </svg>
            Visit website
          </button>
          <button
            type="button"
            onClick=${handleUpvote}
            disabled=${!visited || isVoting}
            class="px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-2 transition-colors ${visited
              ? 'bg-emerald-600 text-white hover:bg-emerald-700'
              : 'bg-gray-100 text-gray-400 cursor-not-allowed'}"
            title=${visited ? 'Cast your upvote' : 'Visit the website first'}
          >
            <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M5 15l7-7 7 7"/>
            </svg>
            ${isVoting ? 'Upvoting…' : 'Upvote'}
          </button>
        </div>
      </div>
    </div>
  `;
};

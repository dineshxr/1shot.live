/* global html */

// Permanent sponsored listings in the "Featured" rail. The links are
// deliberately do-follow: never add rel="nofollow", "sponsored" or "ugc".
// Link the final https://www. URL (both apexes 307 there). index.html repeats
// these links as static HTML (HOME_SSR block) so crawlers that don't run
// JavaScript see them too — keep the two lists in sync.
const SPONSORS = [
  {
    name: 'Bolly.AI',
    url: 'https://www.bolly.ai/',
    logo: '/src/sponsors/bolly.png',
    blurb: 'AI meme video maker — put yourself in any viral clip.',
  },
  {
    name: 'MemeBuilder AI',
    url: 'https://www.memebuilder.ai/',
    logo: '/src/sponsors/memebuilder.svg',
    blurb: 'Convert text to memes with AI — perfect for marketers.',
  },
];

export const RightSidebar = ({ startups = [] }) => {
  // Top 5 by upvote across the visible window
  const topStartups = [...startups]
    .sort((a, b) => (b.upvote_count || 0) - (a.upvote_count || 0))
    .slice(0, 5);

  return html`
    <aside class="sticky top-20 space-y-4">

      <!-- Featured promo / sponsor primary slot -->
      <div class="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">Featured</h3>
          <a href="/featured" class="text-[11px] font-medium text-orange-700 hover:text-orange-800">
            Get featured →
          </a>
        </div>

        <div class="space-y-3">
          ${SPONSORS.map((sponsor) => html`
            <a key=${sponsor.url} href=${sponsor.url} target="_blank" rel="noopener" class="block group">
              <div class="rounded-xl border border-gray-200 p-4 hover:border-gray-300 hover:bg-gray-50 transition-colors">
                <div class="flex items-center gap-3 mb-2">
                  <div class="w-9 h-9 rounded-lg ring-1 ring-gray-200 overflow-hidden bg-white flex items-center justify-center shrink-0">
                    <img src=${sponsor.logo} alt="" width="36" height="36" class="w-full h-full object-contain" />
                  </div>
                  <div class="min-w-0">
                    <div class="font-medium text-sm text-gray-900 truncate">${sponsor.name}</div>
                    <div class="text-[11px] text-gray-500">Sponsored</div>
                  </div>
                </div>
                <p class="text-xs text-gray-500 leading-relaxed">${sponsor.blurb}</p>
              </div>
            </a>
          `)}
        </div>

        <a
          href="/featured"
          class="mt-3 block rounded-xl border border-dashed border-gray-300 p-4 text-center hover:border-orange-400 hover:bg-orange-50 transition-colors"
        >
          <div class="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-2">
            <i class="fas fa-bullhorn text-gray-400 text-sm"></i>
          </div>
          <div class="font-medium text-sm text-gray-900">Promote your product</div>
          <div class="text-[11px] text-gray-500 mt-0.5">Reach thousands of indie hackers</div>
        </a>
      </div>

      <!-- Top this week leaderboard -->
      ${topStartups.length > 0 && html`
        <div class="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
          <h3 class="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-4">Top performers</h3>
          <ol class="space-y-2.5">
            ${topStartups.map((startup, idx) => html`
              <li>
                <a
                  href="/startup/${startup.slug}"
                  class="flex items-center gap-3 group"
                  onClick=${(e) => {
                    e.preventDefault();
                    window.history.pushState({}, "", `/startup/${startup.slug}`);
                    window.dispatchEvent(new PopStateEvent('popstate'));
                  }}
                >
                  <span class="w-5 text-[11px] font-semibold text-gray-400 tabular-nums">
                    ${String(idx + 1).padStart(2, '0')}
                  </span>
                  <div class="w-8 h-8 rounded-lg ring-1 ring-gray-200 overflow-hidden bg-white flex items-center justify-center shrink-0">
                    <img
                      src=${startup.logo || startup.logo_url || startup.screenshot_url}
                      alt=${startup.title}
                      class="w-full h-full object-cover"
                      onError=${(e) => {
                        const firstLetter = startup.title?.charAt(0)?.toUpperCase() || 'S';
                        e.target.src = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%23f5f5f5'/%3E%3Ctext x='50%25' y='50%25' font-family='Arial' font-size='14' fill='%239ca3af' text-anchor='middle' dominant-baseline='middle'%3E${firstLetter}%3C/text%3E%3C/svg%3E`;
                      }}
                    />
                  </div>
                  <div class="flex-1 min-w-0">
                    <div class="text-sm font-medium text-gray-900 group-hover:text-orange-700 transition-colors truncate">
                      ${startup.title}
                    </div>
                    <div class="text-[11px] text-gray-500 truncate">${startup.category || 'Other'}</div>
                  </div>
                  <div class="flex items-center gap-1 text-xs text-gray-500 tabular-nums">
                    <svg class="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 15l7-7 7 7" stroke="currentColor"/>
                    </svg>
                    ${startup.upvote_count || 0}
                  </div>
                </a>
              </li>
            `)}
          </ol>
        </div>
      `}

      <!-- Newsletter / community CTA -->
      <div class="bg-gradient-to-br from-orange-50 to-amber-50 rounded-2xl border border-orange-200 p-5">
        <div class="flex items-center gap-2 mb-2">
          <span class="text-lg">📬</span>
          <h3 class="text-sm font-semibold text-gray-900">Weekly digest</h3>
        </div>
        <p class="text-xs text-gray-600 leading-relaxed mb-3">
          The best launches, delivered to your inbox every Friday.
        </p>
        <a
          href="https://x.com/submithunt"
          target="_blank"
          rel="noopener noreferrer"
          class="inline-flex items-center gap-2 text-xs font-medium text-orange-700 hover:text-orange-800"
        >
          <i class="fab fa-twitter"></i> Follow on X →
        </a>
      </div>

    </aside>
  `;
};

import { html } from 'htm/preact';

// Before/After Domain-Rating comparison cards (same design as the sign-in
// success screen), reused on the pricing and featured pages.
const X_ROWS = ['Buried past page one', 'No high-authority backlinks', 'Hard to get discovered'];
const CHECK_ROWS = ['Featured on the homepage', '37+ DR dofollow backlink', 'Seen by thousands of founders'];

export const DrComparison = () => html`
  <section class="py-12 sm:py-16">
    <div class="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="text-center mb-8">
        <span class="text-xs font-semibold uppercase tracking-wider text-orange-600">The backlink effect</span>
        <h2 class="text-2xl sm:text-3xl font-semibold tracking-tight text-gray-900 mt-2">What a SubmitHunt launch does for your DR</h2>
        <p class="text-gray-500 mt-2">Every plan ships a do-follow 37+ DR backlink. Here's the before and after.</p>
      </div>

      <div class="grid sm:grid-cols-2 gap-4">
        <!-- Before -->
        <div class="bg-white rounded-2xl border border-gray-200 p-6">
          <span class="inline-block text-[10px] font-semibold uppercase tracking-wider text-gray-400 bg-gray-50 border border-gray-200 px-2.5 py-1 rounded-full">Before</span>
          <p class="text-sm font-semibold text-gray-900 mt-3">On your own</p>
          <div class="flex items-baseline gap-2 mt-1 mb-4">
            <span class="text-3xl font-bold tracking-tight text-gray-400">DR 12</span>
          </div>
          <ul class="space-y-2.5 text-sm">
            ${X_ROWS.map((t) => html`
              <li class="flex items-start gap-2 text-gray-400">
                <svg class="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 16 16"><path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round"/></svg>
                <span>${t}</span>
              </li>`)}
          </ul>
        </div>

        <!-- After -->
        <div class="bg-white rounded-2xl border border-orange-300 ring-1 ring-orange-200 p-6">
          <span class="inline-block text-[10px] font-semibold uppercase tracking-wider text-orange-700 bg-orange-50 border border-orange-200 px-2.5 py-1 rounded-full">After</span>
          <p class="text-sm font-semibold text-gray-900 mt-3">On SubmitHunt</p>
          <div class="flex items-baseline gap-2 mt-1 mb-4">
            <span class="text-3xl font-bold tracking-tight text-gray-300">DR 12</span>
            <span class="text-xl text-gray-300">›</span>
            <span class="text-3xl font-bold tracking-tight text-orange-600">37+</span>
          </div>
          <ul class="space-y-2.5 text-sm">
            ${CHECK_ROWS.map((t) => html`
              <li class="flex items-start gap-2 text-gray-700">
                <svg class="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="#059669" stroke-width="2" viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" stroke-linecap="round" stroke-linejoin="round"/></svg>
                <span>${t}</span>
              </li>`)}
          </ul>
        </div>
      </div>
    </div>
  </section>
`;

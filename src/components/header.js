import { OnlineVisitors } from "./online-visitors.js";

export const Header = ({ user }) => {
  /* global html */
  return html`
    <header class="sticky top-0 z-40 bg-white/85 backdrop-blur border-b border-gray-200">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="flex h-16 items-center justify-between gap-4">
          <!-- Brand -->
          <a href="/" class="flex items-center gap-2 group">
            <img src="/src/sh-logo.png" alt="SubmitHunt" class="w-8 h-8 rounded-md" />
            <span class="text-base font-semibold tracking-tight text-gray-900">
              SubmitHunt
            </span>
          </a>

          <!-- Primary nav -->
          <nav class="hidden md:flex items-center gap-1 text-sm">
            <a href="/" class="px-3 py-1.5 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors">Discover</a>
            <a href="/directory" class="px-3 py-1.5 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors">Directory</a>
            <a href="/blog" class="px-3 py-1.5 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors">Blog</a>
            <a href="/pricing" class="px-3 py-1.5 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors">Pricing</a>
            <a href="/featured" class="px-3 py-1.5 rounded-lg text-gray-700 hover:bg-gray-100 transition-colors">Featured</a>
          </nav>

          <!-- Right cluster -->
          <div class="flex items-center gap-2">
            ${!user ? html`<div class="hidden lg:block"><${OnlineVisitors} /></div>` : ''}

            ${user ? html`
              <a
                href="/dashboard"
                class="hidden sm:inline-flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 rounded-lg hover:bg-gray-100 transition-colors"
                title="Dashboard"
              >
                <i class="fas fa-tachometer-alt text-xs"></i>
                <span>Dashboard</span>
              </a>
              <a
                href="/submit"
                class="sh-btn-primary"
              >
                <i class="fas fa-plus text-xs"></i>
                <span>Submit</span>
              </a>
              <div class="flex items-center gap-2 pl-2 ml-1 border-l border-gray-200">
                <img
                  src=${user.user_metadata?.avatar_url || '/placeholder-avatar.png'}
                  alt="User avatar"
                  class="w-7 h-7 rounded-full ring-1 ring-gray-200"
                />
                <button
                  onClick=${() => window.auth.signOut()}
                  class="text-xs text-gray-500 hover:text-gray-900 transition-colors"
                  title="Sign out"
                >
                  Sign out
                </button>
              </div>
            ` : html`
              <a
                href="/submit"
                class="sh-btn-primary"
              >
                <i class="fas fa-plus text-xs"></i>
                <span>Submit</span>
              </a>
            `}
          </div>
        </div>
      </div>
    </header>
  `;
};

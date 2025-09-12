import { OnlineVisitors } from "./online-visitors.js";

export const Header = ({ user }) => {
  /* global html */
  return html`
    <header class="bg-blue-400 text-black border-b-4 border-black">
      <div class="container max-w-6xl mx-auto px-4 py-6 md:py-8">
        <div class="flex flex-col md:flex-row justify-between items-center">
          <div>
            <h1 class="text-3xl md:text-4xl font-bold">💥 Submit Hunt</h1>
            <p class="mt-2 text-black font-medium">
              Discover Startups and AI projects
            </p>
            <p class="mt-1 text-black font-bold bg-yellow-300 inline-block px-2 py-1 rounded border border-black">
              🚀 Launch Today, Get a 37+ DR Backlink
            </p>
          </div>
          <div
            class="mt-4 md:mt-0 flex flex-col md:flex-row items-center gap-4"
          >
            ${!user ? html`<${OnlineVisitors} />` : ''}
            ${user ? html`
              <div class="flex items-center gap-3">
                <div class="flex items-center gap-2">
                  <img 
                    src=${user.user_metadata?.avatar_url || '/placeholder-avatar.png'} 
                    alt="User avatar"
                    class="w-8 h-8 rounded-full border-2 border-black"
                  />
                  <span class="font-medium text-sm">
                    @${user.user_metadata?.user_name || user.email?.split('@')[0] || 'User'}
                  </span>
                </div>
                <a
                  href="/dashboard.html"
                  class="neo-button inline-flex items-center px-3 py-2 bg-blue-400 border-2 border-black rounded shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-blue-500 font-bold text-sm"
                >
                  <i class="fas fa-tachometer-alt mr-2"></i> Dashboard
                </a>
                <button
                  onClick=${() => window.openSubmitForm()}
                  class="neo-button inline-flex items-center px-4 py-2 bg-green-400 border-2 border-black rounded shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-green-500 font-bold animate-pulse"
                >
                  <i class="fas fa-rocket mr-2"></i> Submit Product
                </button>
                <button
                  onClick=${() => window.auth.signOut()}
                  class="neo-button inline-flex items-center px-3 py-1 bg-red-400 border-2 border-black rounded shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-red-500 font-bold text-sm"
                >
                  <i class="fas fa-sign-out-alt mr-1"></i> Logout
                </button>
              </div>
            ` : html`
              <button
                id="submit-startup-btn"
                class="neo-button inline-flex items-center px-4 py-2 bg-purple-400 border-2 border-black rounded shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-purple-500 font-bold"
              >
                <i class="fas fa-plus mr-2"></i> Submit Product
              </button>
            `}
          </div>
        </div>
      </div>
    </header>
  `;
};

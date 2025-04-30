import { OnlineVisitors } from "./online-visitors.js";

export const Header = () => {
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
              🚀 Launch Today, Get a 36+ DR Backlink
            </p>
          </div>
          <div
            class="mt-4 md:mt-0 flex flex-col md:flex-row items-center gap-4"
          >
            <${OnlineVisitors} />
            <button
              id="submit-game-btn"
              class="neo-button inline-flex items-center px-4 py-2 bg-purple-400 border-2 border-black rounded shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-purple-500 font-bold"
            >
              <i class="fas fa-plus mr-2"></i> Submit Project
            </button>
          </div>
        </div>
      </div>
    </header>
  `;
};

export const Footer = () => {
  return html`
    <footer class="bg-green-400 text-black py-8 border-t-4 border-black">
      <div class="container max-w-6xl mx-auto px-4">
        <div class="flex flex-col md:flex-row justify-between items-center">
          <div class="mb-4 md:mb-0">
            <h2 class="text-xl font-bold">Submit Hunt</h2>
            <p class="text-black mt-1 font-medium">
              A directory for Startups and AI projects
            </p>
          </div>
          <div class="flex space-x-4">
            <a
              href="https://x.com/submithunt"
              target="_blank"
              class="text-black hover:text-blue-800 transition-colors"
            >
              <i class="fab fa-twitter text-xl"></i>
            </a>
          </div>
        </div>
        <div
          class="mt-6 text-center text-black font-medium border-t-2 border-black pt-4"
        >
          <div class="flex items-center justify-center">
            <img src="/src/sh-logo.png" alt="SubmitHunt Logo" class="w-6 h-6 mr-2" />
            ${new Date().getFullYear()} · Submit Hunt · All rights reserved
          </div>
        </div>
      </div>
    </footer>
  `;
};

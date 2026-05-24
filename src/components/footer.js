export const Footer = () => {
  return html`
    <footer class="mt-16 border-t border-gray-200 bg-white">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
        <div class="flex flex-col md:flex-row justify-between items-start gap-8">
          <div class="max-w-sm">
            <div class="flex items-center gap-2 mb-2">
              <img src="/src/sh-logo.png" alt="SubmitHunt" class="w-6 h-6 rounded-md" />
              <span class="text-sm font-semibold text-gray-900">SubmitHunt</span>
            </div>
            <p class="text-sm text-gray-500">
              A directory for startups and AI projects — launch today, get a DR&nbsp;37+ backlink.
            </p>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-3 gap-x-12 gap-y-2 text-sm">
            <div>
              <h4 class="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">Product</h4>
              <ul class="space-y-2">
                <li><a href="/" class="text-gray-600 hover:text-gray-900 transition-colors">Discover</a></li>
                <li><a href="/submit" class="text-gray-600 hover:text-gray-900 transition-colors">Submit</a></li>
                <li><a href="/featured" class="text-gray-600 hover:text-gray-900 transition-colors">Featured</a></li>
                <li><a href="/pricing" class="text-gray-600 hover:text-gray-900 transition-colors">Pricing</a></li>
              </ul>
            </div>
            <div>
              <h4 class="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">Resources</h4>
              <ul class="space-y-2">
                <li><a href="/blog" class="text-gray-600 hover:text-gray-900 transition-colors">Blog</a></li>
                <li><a href="/dashboard" class="text-gray-600 hover:text-gray-900 transition-colors">Dashboard</a></li>
              </ul>
            </div>
            <div>
              <h4 class="text-xs font-semibold text-gray-900 uppercase tracking-wider mb-3">Connect</h4>
              <ul class="space-y-2">
                <li>
                  <a
                    href="https://x.com/submithunt"
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
                  >
                    <i class="fab fa-twitter"></i><span>X / Twitter</span>
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div class="mt-10 pt-6 border-t border-gray-200 flex flex-col sm:flex-row justify-between items-center gap-3">
          <p class="text-xs text-gray-500">
            © ${new Date().getFullYear()} SubmitHunt. All rights reserved.
          </p>
          <p class="text-xs text-gray-400">
            Built for indie hackers · launch and get discovered
          </p>
        </div>
      </div>
    </footer>
  `;
};

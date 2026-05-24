/* global html, useState, useEffect */

export const Sidebar = ({ startups = [], onCategoryFilter, onSortChange, selectedCategory = 'all', onSearchChange }) => {
  const [stats, setStats] = useState({
    totalStartups: 0,
    todayLaunches: 0,
    totalUpvotes: 0
  });
  const [searchQuery, setSearchQuery] = useState('');

  // Calculate statistics
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    const todayStartups = startups.filter(startup =>
      startup.launch_date === today || startup.created_at?.startsWith(today)
    );
    const totalUpvotes = startups.reduce((sum, startup) => sum + (startup.upvote_count || 0), 0);

    setStats({
      totalStartups: startups.length,
      todayLaunches: todayStartups.length,
      totalUpvotes
    });
  }, [startups]);

  // Get unique categories from startups data with counts
  const getUniqueCategories = () => {
    const categoryMap = new Map();

    startups.forEach(startup => {
      if (startup.category) {
        const count = categoryMap.get(startup.category) || 0;
        categoryMap.set(startup.category, count + 1);
      }
    });

    const categoryIcons = {
      'AI/ML': '🤖',
      'Other': '📦',
      'Design': '🎨',
      'Web App': '🌐',
      'SaaS': '⚡',
      'Gaming': '🎮',
      'Developer Tools': '👨‍💻',
      'Productivity': '📊',
      'Social': '👥',
      'API/Service': '🔗',
      'Marketing': '📈',
      'E-commerce': '🛒',
      'Health & Fitness': '🏃‍♂️',
      'Education': '📚',
      'Chrome Extension': '🧩',
      'Mobile App': '📱'
    };

    const categoryArray = Array.from(categoryMap.entries())
      .map(([category, count]) => ({
        id: category,
        name: category,
        icon: categoryIcons[category] || '📦',
        count
      }))
      .sort((a, b) => b.count - a.count);

    return [
      { id: 'all', name: 'All Products', icon: '🚀', count: startups.length },
      ...categoryArray
    ];
  };

  const categories = getUniqueCategories();

  return html`
    <aside class="sticky top-20 space-y-4">
      <!-- Search -->
      <div class="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm">
        <div class="relative">
          <input
            type="text"
            placeholder="Search products…"
            value=${searchQuery}
            onInput=${(e) => {
              const query = e.target.value;
              setSearchQuery(query);
              if (onSearchChange) {
                onSearchChange(query);
              }
            }}
            class="w-full pl-9 pr-12 py-2 bg-gray-50 border border-gray-200 rounded-lg focus:bg-white focus:border-gray-400 focus:ring-1 focus:ring-gray-300 focus:outline-none text-sm placeholder:text-gray-400"
          />
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-400">
            <i class="fas fa-search text-xs"></i>
          </div>
          <div class="absolute inset-y-0 right-0 pr-2 flex items-center pointer-events-none">
            <span class="font-mono text-[10px] text-gray-400 bg-white border border-gray-200 px-1.5 py-0.5 rounded">⌘K</span>
          </div>
        </div>
      </div>

      <!-- Statistics -->
      <div class="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <h3 class="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-4">2026 Stats</h3>
        <div class="grid grid-cols-2 gap-4">
          <div>
            <div class="text-xl font-semibold text-gray-900 tabular-nums">275,374</div>
            <div class="text-xs text-gray-500 mt-0.5">Visits</div>
          </div>
          <div>
            <div class="text-xl font-semibold text-gray-900 tabular-nums">1,150,289</div>
            <div class="text-xs text-gray-500 mt-0.5">Page views</div>
          </div>
        </div>
      </div>

      <!-- Categories -->
      <div class="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
        <h3 class="text-[11px] font-semibold text-gray-500 uppercase tracking-wider mb-4">Categories</h3>
        <div class="space-y-1">
          ${categories.map(category => html`
            <button
              onClick=${() => onCategoryFilter(category.id)}
              class="w-full flex items-center justify-between px-2.5 py-2 text-sm rounded-lg transition-colors ${
                selectedCategory === category.id
                  ? 'bg-gray-900 text-white'
                  : 'text-gray-700 hover:bg-gray-100'
              }"
            >
              <div class="flex items-center gap-2.5 min-w-0">
                <span class="text-base shrink-0">${category.icon}</span>
                <span class="font-medium truncate">${category.name}</span>
              </div>
              <span class="text-[11px] font-medium tabular-nums ${
                selectedCategory === category.id
                  ? 'text-gray-300'
                  : 'text-gray-400'
              }">
                ${category.count}
              </span>
            </button>
          `)}
        </div>
      </div>
    </aside>
  `;
};

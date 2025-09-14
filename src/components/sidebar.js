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
    
    // Count all categories from startups
    startups.forEach(startup => {
      if (startup.category) {
        const count = categoryMap.get(startup.category) || 0;
        categoryMap.set(startup.category, count + 1);
      }
    });
    
    // Define category icons based on actual database categories
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
    
    // Convert to array and sort by count (descending)
    const categoryArray = Array.from(categoryMap.entries())
      .map(([category, count]) => ({
        id: category,
        name: category,
        icon: categoryIcons[category] || '📦',
        count
      }))
      .sort((a, b) => b.count - a.count);
    
    // Add "All Products" at the beginning
    return [
      { id: 'all', name: 'All Products', icon: '🚀', count: startups.length },
      ...categoryArray
    ];
  };
  
  const categories = getUniqueCategories();

  const sortOptions = [
    { id: 'trending', name: 'Trending', icon: '🔥' },
    { id: 'newest', name: 'Newest', icon: '✨' },
    { id: 'most_upvoted', name: 'Most Upvoted', icon: '👍' },
    { id: 'alphabetical', name: 'A-Z', icon: '🔤' }
  ];

  return html`
    <div class="bg-white rounded-lg border border-gray-200 sticky top-0">
      <!-- Logo & Header -->
      <div class="p-6 border-b border-gray-100">
        <div class="relative">
          <input
            type="text"
            placeholder="Search a product"
            value=${searchQuery}
            onInput=${(e) => {
              const query = e.target.value;
              setSearchQuery(query);
              if (onSearchChange) {
                onSearchChange(query);
              }
            }}
            class="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
          />
          <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <i class="fas fa-search text-gray-400"></i>
          </div>
          <div class="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
            <span class="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">⌘ K</span>
          </div>
        </div>
      </div>

      <!-- Statistics -->
      <div class="p-6 border-b border-gray-200">
        <h3 class="text-sm font-semibold text-gray-900 mb-4">2025 STATISTICS ©</h3>
        <div class="grid grid-cols-2 gap-4">
          <div class="text-center">
            <div class="text-2xl font-bold text-gray-900">275,374</div>
            <div class="text-xs text-gray-500">Visits</div>
          </div>
          <div class="text-center">
            <div class="text-2xl font-bold text-gray-900">1,150,289</div>
            <div class="text-xs text-gray-500">Page views</div>
          </div>
        </div>
      </div>

      <!-- Partners -->
      <div class="p-6 border-b border-gray-200">
        <h3 class="text-sm font-semibold text-gray-900 mb-4">OUR SPONSORS</h3>
        <a href="https://memebuilder.ai" target="_blank" rel="dofollow" class="block">
          <div class="bg-gray-50 rounded-lg p-4 hover:bg-gray-100 transition-colors">
            <div class="flex items-center mb-3">
              <div class="w-8 h-8 bg-gradient-to-r from-purple-500 to-pink-500 rounded flex items-center justify-center mr-3">
                <span class="text-white font-bold text-sm">M</span>
              </div>
              <span class="font-medium text-gray-900">MemeBuilder AI</span>
            </div>
            <p class="text-xs text-gray-600 mb-3">Convert text to Memes with AI</p>
          </div>
        </a>
        
        <!-- Empty Placement -->
        <div class="mt-4">
          <a 
            href="/featured.html" 
            class="block bg-white border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-gray-400 transition-colors"
          >
            <div class="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mx-auto mb-3">
              <i class="fas fa-bullhorn text-gray-400"></i>
            </div>
            <h3 class="font-medium text-gray-900 mb-2">Promote your product here!</h3>
            <p class="text-xs text-gray-500">Get featured and reach thousands of users</p>
          </a>
        </div>
      </div>

      <!-- Categories -->
      <div class="p-6 border-b border-gray-200">
        <h3 class="text-sm font-semibold text-gray-900 mb-4">CATEGORIES</h3>
        <div class="space-y-2">
          ${categories.map(category => html`
            <button
              onClick=${() => onCategoryFilter(category.id)}
              class="w-full flex items-center justify-between px-3 py-2 text-sm rounded-lg transition-colors ${
                selectedCategory === category.id
                  ? 'bg-orange-50 text-orange-700 border border-orange-200'
                  : 'text-gray-600 hover:bg-gray-50'
              }"
            >
              <div class="flex items-center">
                <span class="mr-3 text-lg">${category.icon}</span>
                <span class="font-medium">${category.name}</span>
              </div>
              <span class="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                ${category.count}
              </span>
            </button>
          `)}
        </div>
      </div>

    </div>
  `;
};

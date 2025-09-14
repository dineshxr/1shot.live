// @ts-nocheck
/* global useState, useEffect, html */
import { supabaseClient } from "../lib/supabase-client.js";
import { placeholderProjects as placeholderProducts } from "../lib/placeholder-data.js";
import { StartupCard } from "./startup-card.js";
import { StartupModal } from "./startup-modal.js";
import { LaunchCountdown } from "./launch-countdown.js";

// These are already defined globally in main.js
// Using the global variables directly


export const Content = ({ user, onStartupsChange, selectedCategory, sortBy, searchQuery = '', onCategoryFilter, onSortChange }) => {
  const [startups, setStartups] = useState([]);
  const [filteredStartups, setFilteredStartups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedStartup, setSelectedStartup] = useState(null);
  const [groupedStartups, setGroupedStartups] = useState({});
  const [timeFilter, setTimeFilter] = useState('daily');
  // Remove duplicate state - using props from parent

  const fetchStartups = async () => {
    try {
      // Try to fetch from Supabase first
      try {
        const supabase = supabaseClient();
        // Get today's date in YYYY-MM-DD format using PDT time zone
        const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Los_Angeles' }));
        const todayStr = today.getFullYear() + '-' + 
                      String(today.getMonth() + 1).padStart(2, '0') + '-' + 
                      String(today.getDate()).padStart(2, '0');
        
        // Get user email for vote checking
        const userEmail = user?.email || null;
        
        const { data, error } = await supabase
          .rpc('get_startups_with_votes', { user_email_param: userEmail });
        
        // Filter results to only show startups launched today or earlier
        const filteredData = data?.filter(startup => startup.launch_date <= todayStr) || [];

        if (!error && filteredData && filteredData.length > 0) {
          setStartups(filteredData);
          setFilteredStartups(filteredData);
          onStartupsChange?.(filteredData);
          
          // Group startups by launch date
          const grouped = {};
          filteredData.forEach(startup => {
            const launchDate = startup.launch_date;
            // Ensure we're using the correct date in PDT time zone
            const adjustedDate = launchDate;
            if (!grouped[adjustedDate]) {
              grouped[adjustedDate] = [];
            }
            grouped[adjustedDate].push(startup);
          });
          setGroupedStartups(grouped);
          
          // Check for hash in URL
          const hash = window.location.hash.slice(1); // Remove the # symbol
          if (hash) {
            const startup = data.find((g) => g.slug === hash);
            if (startup) setSelectedStartup(startup);
          }
          return;
        }
      } catch (supabaseErr) {
        console.log("Supabase fetch failed, using placeholder data", supabaseErr);
      }
      
      // If Supabase fetch fails or returns no data, use placeholder data
      setStartups(placeholderProducts);
      setFilteredStartups(placeholderProducts);
      onStartupsChange?.(placeholderProducts);
      
      // Group placeholder startups by launch date
      const grouped = {};
      placeholderProducts.forEach(startup => {
        // Use created_at as fallback if launch_date is not available
        const launchDate = startup.launch_date || startup.created_at?.split('T')[0] || new Date().toISOString().split('T')[0];
        if (!grouped[launchDate]) {
          grouped[launchDate] = [];
        }
        grouped[launchDate].push(startup);
      });
      setGroupedStartups(grouped);
      
      // Check for hash in URL with placeholder data
      const hash = window.location.hash.slice(1);
      if (hash) {
        const startup = placeholderProducts.find((g) => g.slug === hash);
        if (startup) setSelectedStartup(startup);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStartups();

    // Listen for refresh requests
    window.addEventListener("refresh-startups", fetchStartups);

    // Listen for auth changes
    const handleAuthChange = () => {
      fetchStartups(); // Refetch with user context
    };
    window.addEventListener("auth-changed", handleAuthChange);

    // Listen for hash changes
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (hash) {
        const startup = startups.find((s) => s.slug === hash);
        if (startup) setSelectedStartup(startup);
      } else {
        setSelectedStartup(null);
      }
    };
    window.addEventListener("hashchange", handleHashChange);

    return () => {
      window.removeEventListener("refresh-startups", fetchStartups);
      window.removeEventListener("auth-changed", handleAuthChange);
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  // Filter and sort startups based on selected category, sort option, search query, and time filter
  useEffect(() => {
    let filtered = startups;

    // Filter by time period
    if (timeFilter !== 'daily') {
      const now = new Date();
      const filterDate = new Date();
      
      if (timeFilter === 'weekly') {
        filterDate.setDate(now.getDate() - 7);
      } else if (timeFilter === 'monthly') {
        filterDate.setMonth(now.getMonth() - 1);
      } else if (timeFilter === 'yearly') {
        filterDate.setFullYear(now.getFullYear() - 1);
      }
      
      filtered = filtered.filter(startup => {
        const launchDate = new Date(startup.launch_date || startup.created_at);
        return launchDate >= filterDate;
      });
    }

    // Filter by category
    if (selectedCategory && selectedCategory !== 'all') {
      filtered = filtered.filter(startup => startup.category === selectedCategory);
    }

    // Filter by search query
    if (searchQuery && searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(startup => 
        startup.title?.toLowerCase().includes(query) ||
        startup.description?.toLowerCase().includes(query) ||
        startup.category?.toLowerCase().includes(query) ||
        startup.author?.name?.toLowerCase().includes(query)
      );
    }

    // Sort startups
    if (sortBy === 'trending') {
      filtered = filtered.sort((a, b) => (b.upvote_count || 0) - (a.upvote_count || 0));
    } else if (sortBy === 'newest') {
      filtered = filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (sortBy === 'oldest') {
      filtered = filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    }

    setFilteredStartups(filtered);
  }, [startups, selectedCategory, sortBy, searchQuery, timeFilter]);

  // Group startups by date
  useEffect(() => {
    const grouped = {};
    filteredStartups.forEach(startup => {
      const date = startup.launch_date || startup.created_at;
      const dateKey = new Date(date).toDateString();
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(startup);
    });
    setGroupedStartups(grouped);
  }, [filteredStartups]);

  const handleStartupClick = (startup) => {
    setSelectedStartup(startup);
    // Update URL hash
    window.location.hash = `startup-${startup.id}`;
  };

  const handleCloseModal = () => {
    setSelectedStartup(null);
    // Clear URL hash
    window.location.hash = '';
  };

  const handleShare = (startup) => {
    const url = `${window.location.origin}#startup-${startup.id}`;
    if (navigator.share) {
      navigator.share({
        title: startup.title,
        text: startup.description,
        url: url
      });
    } else {
      navigator.clipboard.writeText(url);
      // You could add a toast notification here
    }
  };

  const handleHashChange = () => {
    const hash = window.location.hash;
    if (hash.startsWith('#startup-')) {
      const startupId = hash.replace('#startup-', '');
      const startup = startups.find(s => s.id.toString() === startupId);
      if (startup) {
        setSelectedStartup(startup);
      }
    } else {
      setSelectedStartup(null);
    }
  };

  // Handle browser back/forward
  useEffect(() => {
    handleHashChange(); // Check initial hash
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [startups]);

  // Update parent component with startups
  useEffect(() => {
    if (onStartupsChange) {
      onStartupsChange(startups);
    }
  }, [startups, onStartupsChange]);

  const updateURL = () => {
    const params = new URLSearchParams();
    if (selectedCategory && selectedCategory !== 'all') {
      params.set('category', selectedCategory);
    }
    if (sortBy && sortBy !== 'trending') {
      params.set('sort', sortBy);
    }
    if (searchQuery) {
      params.set('search', searchQuery);
    }
    
    const newURL = params.toString() ? 
      `${window.location.pathname}?${params.toString()}` : 
      window.location.pathname;
    
    window.history.replaceState(
      null, 
      '', 
      newURL + window.location.hash
    );
  };

  // Update URL when filters change
  useEffect(() => {
    updateURL();
  }, [selectedCategory, sortBy, searchQuery]);

  // Parse URL parameters on component mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const categoryParam = urlParams.get('category');
    const sortParam = urlParams.get('sort');
    const searchParam = urlParams.get('search');
    
    if (categoryParam && onCategoryFilter) {
      onCategoryFilter(categoryParam);
    }
    if (sortParam && onSortChange) {
      onSortChange(sortParam);
    }
    
    // Note: search is handled by parent component
  }, []);

  // Listen for URL changes (back/forward)
  useEffect(() => {
    const handlePopState = () => {
      const urlParams = new URLSearchParams(window.location.search);
      const categoryParam = urlParams.get('category') || 'all';
      const sortParam = urlParams.get('sort') || 'trending';
      
      if (onCategoryFilter) {
        onCategoryFilter(categoryParam);
      }
      if (onSortChange) {
        onSortChange(sortParam);
      }
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [onCategoryFilter, onSortChange]);

  // Sync URL with current state
  useEffect(() => {
    window.history.replaceState(
      null,
      '',
      window.location.pathname + window.location.search
    );
  }, []);

  const handleUpvoteChange = (startupId, newUpvoteCount, userVoted) => {
    // Update the startup in the local state
    setStartups(prevStartups => 
      prevStartups.map(startup => 
        startup.id === startupId 
          ? { ...startup, upvote_count: newUpvoteCount, user_voted: userVoted }
          : startup
      )
    );

    // Update filtered startups as well
    setFilteredStartups(prevFiltered =>
      prevFiltered.map(startup =>
        startup.id === startupId
          ? { ...startup, upvote_count: newUpvoteCount, user_voted: userVoted }
          : startup
      )
    );

    // Update grouped startups as well
    setGroupedStartups(prevGrouped => {
      const newGrouped = { ...prevGrouped };
      Object.keys(newGrouped).forEach(date => {
        newGrouped[date] = newGrouped[date].map(startup =>
          startup.id === startupId
            ? { ...startup, upvote_count: newUpvoteCount, user_voted: userVoted }
            : startup
        );
      });
      return newGrouped;
    });

    // Update daily rankings
    const supabase = supabaseClient();
    supabase.rpc('update_daily_rankings').then(() => {
      // Refetch startups to get updated rankings
      setTimeout(fetchStartups, 1000);
    });
  };

  const closeModal = () => {
    setSelectedStartup(null);
    // Remove hash from URL without triggering hashchange
    history.pushState(
      "",
      document.title,
      window.location.pathname + window.location.search
    );
  };

  return html`
    <div>
      <div class="mb-8">
        <div class="flex items-center justify-between mb-6">
          <div>
            <h1 class="text-3xl font-bold text-gray-900">
              ${timeFilter === 'daily' ? 'Daily launches' : 
                timeFilter === 'weekly' ? 'Weekly launches' :
                timeFilter === 'monthly' ? 'Monthly launches' : 'Yearly launches'}
            </h1>
            <p class="text-gray-600 mt-1">
              ${timeFilter === 'daily' ? 'Discover the best products launched today' : 
                timeFilter === 'weekly' ? 'Discover the best products launched this week' :
                timeFilter === 'monthly' ? 'Discover the best products launched this month' : 'Discover the best products launched this year'}
            </p>
          </div>
          <div class="flex items-center gap-4">
            <div class="flex gap-2">
              <button 
                onClick=${() => setTimeFilter('daily')}
                class="px-3 py-1 text-sm rounded-full font-medium ${
                  timeFilter === 'daily' 
                    ? 'bg-orange-100 text-orange-600' 
                    : 'text-gray-600 hover:bg-gray-100'
                }"
              >
                Daily
              </button>
              <button 
                onClick=${() => setTimeFilter('weekly')}
                class="px-3 py-1 text-sm rounded-full ${
                  timeFilter === 'weekly' 
                    ? 'bg-orange-100 text-orange-600 font-medium' 
                    : 'text-gray-600 hover:bg-gray-100'
                }"
              >
                Weekly
              </button>
              <button 
                onClick=${() => setTimeFilter('monthly')}
                class="px-3 py-1 text-sm rounded-full ${
                  timeFilter === 'monthly' 
                    ? 'bg-orange-100 text-orange-600 font-medium' 
                    : 'text-gray-600 hover:bg-gray-100'
                }"
              >
                Monthly
              </button>
              <button 
                onClick=${() => setTimeFilter('yearly')}
                class="px-3 py-1 text-sm rounded-full ${
                  timeFilter === 'yearly' 
                    ? 'bg-orange-100 text-orange-600 font-medium' 
                    : 'text-gray-600 hover:bg-gray-100'
                }"
              >
                Yearly
              </button>
            </div>
          </div>
        </div>
        
        <div class="mb-6">
          ${LaunchCountdown()}
        </div>
      </div>

      <div>

      ${loading &&
      html`
        <div
          class="flex flex-col gap-2 justify-center items-center min-h-[200px]"
        >
          <div
            class="animate-spin rounded-full h-12 w-12 border-4 border-black border-t-transparent"
          ></div>
          <span>Fetching startups data</span>
        </div>
      `}
      ${error &&
      html`
        <div class="bg-red-100 border-2 border-red-500 p-4 rounded mb-8">
          <p class="text-red-700">${error}</p>
        </div>
      `}
      ${!loading &&
      !error &&
      html`
        <section aria-labelledby="startups-heading" class="mt-8">
          <div class="space-y-4">
            ${filteredStartups.map(
              (startup) => html`<${StartupCard} key=${startup.id} startup=${startup} user=${user} onUpvoteChange=${handleUpvoteChange} />`
            )}
          </div>
          
          ${filteredStartups.length === 0 && !loading && html`
            <div class="text-center py-16">
              <div class="text-6xl mb-4">🔍</div>
              <h3 class="text-xl font-semibold text-gray-900 mb-2">No products found</h3>
              <p class="text-gray-600">Try adjusting your filters or check back later for new launches.</p>
            </div>
          `}
        </section>
      `}
      </div>
      
      ${selectedStartup &&
      html`<${StartupModal} startup=${selectedStartup} onClose=${closeModal} />`}
    </div>
  `;
};

// Export the sidebar props for the main app
export const getSidebarProps = (startups, onCategoryFilter, onSortChange, selectedCategory) => {
  return {
    startups,
    onCategoryFilter,
    onSortChange,
    selectedCategory
  };
};

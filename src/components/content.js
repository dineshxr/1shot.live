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
        // Get today's date in YYYY-MM-DD format using EST time zone
        const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
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
          // Merge in comment counts so cards can show a comment icon + count.
          // The comments table is sparse, so one lightweight query covers all.
          let withCounts = filteredData;
          try {
            const { data: commentRows } = await supabase
              .from('comments')
              .select('startup_id');
            if (Array.isArray(commentRows)) {
              const counts = {};
              commentRows.forEach((r) => {
                if (r && r.startup_id) counts[r.startup_id] = (counts[r.startup_id] || 0) + 1;
              });
              withCounts = filteredData.map((s) => ({ ...s, comment_count: counts[s.id] || 0 }));
            }
          } catch (e) {
            console.log('Comment counts unavailable:', e);
          }

          setStartups(withCounts);
          setFilteredStartups(withCounts);
          onStartupsChange?.(withCounts);

          // Group startups by launch date
          const grouped = {};
          withCounts.forEach(startup => {
            const dateKey = startup.launch_date;
            if (!dateKey) return;
            if (!grouped[dateKey]) {
              grouped[dateKey] = [];
            }
            grouped[dateKey].push(startup);
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
        const dateKey = startup.launch_date || startup.created_at?.split('T')[0] || new Date().toISOString().split('T')[0];
        if (!dateKey) return;
        if (!grouped[dateKey]) {
          grouped[dateKey] = [];
        }
        grouped[dateKey].push(startup);
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
    // Update daily rankings once on initial load
    const updateRankings = async () => {
      try {
        const supabase = supabaseClient();
        await supabase.rpc('update_daily_rankings');
        console.log('Daily rankings updated');
      } catch (err) {
        console.log('Rankings update error:', err);
      }
    };
    updateRankings();

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

  // Filter and sort startups based on category, sort, and search
  useEffect(() => {
    let filtered = [...startups];

    // Apply category filter
    if (selectedCategory && selectedCategory !== 'all') {
      filtered = filtered.filter(startup => {
        return startup.category === selectedCategory;
      });
    }

    // Apply search filter
    if (searchQuery && searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      filtered = filtered.filter(startup =>
        startup.title?.toLowerCase().includes(query) ||
        startup.description?.toLowerCase().includes(query) ||
        startup.category?.toLowerCase().includes(query) ||
        startup.author?.name?.toLowerCase().includes(query)
      );
    }

    // Apply time filter
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

    // Sort startups
    if (sortBy === 'trending') {
      filtered = filtered.sort((a, b) => (b.upvote_count || 0) - (a.upvote_count || 0));
    } else if (sortBy === 'newest') {
      filtered = filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (sortBy === 'oldest') {
      filtered = filtered.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else if (sortBy === 'alphabetical') {
      filtered = filtered.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === 'most_upvoted') {
      filtered = filtered.sort((a, b) => (b.upvote_count || 0) - (a.upvote_count || 0));
    }

    // Group startups by launch date
    const grouped = {};
    filtered.forEach(startup => {
      const launchDate = startup.launch_date || startup.created_at;
      if (!launchDate) return;
      const dateKey = launchDate.split('T')[0]; // YYYY-MM-DD
      if (!grouped[dateKey]) {
        grouped[dateKey] = [];
      }
      grouped[dateKey].push(startup);
    });

    setGroupedStartups(grouped);
    setFilteredStartups(filtered);
  }, [startups, selectedCategory, sortBy, searchQuery, timeFilter]);


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

  const timeLabels = {
    daily: { title: 'Daily launches', sub: 'Discover the best products launched today' },
    weekly: { title: 'Weekly launches', sub: 'Discover the best products launched this week' },
    monthly: { title: 'Monthly launches', sub: 'Discover the best products launched this month' },
    yearly: { title: 'Yearly launches', sub: 'Discover the best products launched this year' },
  };

  return html`
    <div>
      <div class="mb-8">
        <div class="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
          <div>
            <h1 class="text-3xl sm:text-4xl font-semibold tracking-tight text-gray-900">
              ${timeLabels[timeFilter].title}
            </h1>
            <p class="text-gray-500 mt-2 text-sm sm:text-base">
              ${timeLabels[timeFilter].sub}
            </p>
          </div>
          <div class="inline-flex items-center gap-1 p-1 bg-white border border-gray-200 rounded-xl shadow-sm self-start sm:self-auto">
            ${['daily', 'weekly', 'monthly', 'yearly'].map(key => html`
              <button
                onClick=${() => setTimeFilter(key)}
                class="px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${
                  timeFilter === key
                    ? 'bg-gray-900 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }"
              >
                ${key.charAt(0).toUpperCase() + key.slice(1)}
              </button>
            `)}
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
          class="flex flex-col gap-3 justify-center items-center min-h-[200px] text-gray-500"
        >
          <div
            class="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-gray-900"
          ></div>
          <span class="text-sm">Fetching startups…</span>
        </div>
      `}
      ${error &&
    html`
        <div class="bg-red-50 border border-red-200 p-4 rounded-xl mb-8">
          <p class="text-red-700 text-sm">${error}</p>
        </div>
      `}
      ${!loading &&
    !error &&
    html`
        <section aria-labelledby="startups-heading" class="mt-8">
          ${Object.keys(groupedStartups).length > 0 ?
        (() => {
          const sortedDateKeys = Object.keys(groupedStartups).sort((a, b) => new Date(b) - new Date(a));
          let totalStartupsRendered = 0;
          let featuredCardShown = false;

          return sortedDateKeys.map((dateKey, index) => {
            const startups = groupedStartups[dateKey];
            // Construct date at noon UTC to avoid timezone shifting to previous day
            const date = new Date(`${dateKey}T12:00:00Z`);
            const formattedDate = date.toLocaleDateString('en-US', {
              weekday: 'long',
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              timeZone: 'America/New_York'
            });

            const shouldShowFeatured = !featuredCardShown && totalStartupsRendered + startups.length >= 6;
            if (shouldShowFeatured) featuredCardShown = true;

            const result = html`
                  <div class="mb-10">
                    <div class="flex items-center gap-4 mb-5">
                      <h2 class="text-sm font-semibold text-gray-900 tracking-tight whitespace-nowrap">
                        Launched on ${formattedDate}
                        <span class="ml-2 text-gray-400 font-normal">${startups.length} startup${startups.length !== 1 ? 's' : ''}</span>
                      </h2>
                      <div class="flex-1 h-px bg-gray-200"></div>
                    </div>
                    <div class="space-y-3">
                      ${startups.map(
              (startup) => html`<${StartupCard} 
                          key=${startup.id} 
                          startup=${startup} 
                          user=${user} 
                          onUpvoteChange=${handleUpvoteChange}
                          allStartups=${filteredStartups}
                        />`
            )}
                    </div>
                  </div>
                  
                  <!-- Featured Product Placement Card - Show after 6 listings -->
                  ${shouldShowFeatured ? html`
                    <a href="/featured" class="block">
                      <div class="bg-orange-50/50 border border-dashed border-orange-300 rounded-2xl p-5 hover:bg-orange-50 hover:border-orange-400 transition-all duration-200 w-full mb-3 group">
                        <div class="flex items-start gap-4">
                          <div class="w-12 h-12 rounded-xl bg-white border border-orange-200 flex items-center justify-center text-orange-500">
                            <i class="fas fa-bullhorn"></i>
                          </div>
                          <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 mb-1">
                              <h3 class="text-base font-semibold text-gray-900 group-hover:text-orange-700 transition-colors">
                                Your product here
                              </h3>
                              <span class="text-[10px] font-semibold uppercase tracking-wider text-orange-700 bg-orange-100 border border-orange-200 px-2 py-0.5 rounded-full">
                                Featured
                              </span>
                            </div>
                            <p class="text-sm text-gray-600 leading-relaxed">
                              This premium spot showcases your product to every SubmitHunt visitor. Tap to get featured.
                            </p>
                          </div>
                          <div class="hidden sm:flex items-center text-gray-400 group-hover:text-orange-600 transition-colors">
                            <i class="fas fa-arrow-right"></i>
                          </div>
                        </div>
                      </div>
                    </a>
                  ` : ''}
                `;

            totalStartupsRendered += startups.length;
            return result;
          });
        })()
        : html`
              <div class="text-center py-16">
                <div class="text-6xl mb-4">🔍</div>
                <h3 class="text-xl font-semibold text-gray-900 mb-2">No products found</h3>
                <p class="text-gray-600">Try adjusting your filters or check back later for new launches.</p>
              </div>
            `
      }
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

import { supabaseClient } from "../lib/supabase-client.js";
import { placeholderProjects as placeholderProducts } from "../lib/placeholder-data.js";
import { StartupCard } from "./startup-card.js";
import { StartupModal } from "./startup-modal.js";

// These are already defined globally in main.js
// Using the global variables directly

export const Content = () => {
  const [startups, setStartups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedStartup, setSelectedStartup] = useState(null);
  const [groupedStartups, setGroupedStartups] = useState({});

  const fetchStartups = async () => {
    try {
      // Try to fetch from Supabase first
      try {
        const supabase = supabaseClient();
        const today = new Date().toISOString().split('T')[0]; // Get today's date in YYYY-MM-DD format
        
        const { data, error } = await supabase
          .from("startups")
          .select("*")
          // Only show startups that are scheduled to launch today or earlier
          .lte('launch_date', today)
          .order("launch_date", { ascending: false }); // Sort by launch date, newest first

        if (!error && data && data.length > 0) {
          setStartups(data);
          
          // Group startups by launch date
          const grouped = {};
          data.forEach(startup => {
            const launchDate = startup.launch_date;
            if (!grouped[launchDate]) {
              grouped[launchDate] = [];
            }
            grouped[launchDate].push(startup);
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
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

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
    <main class="container mx-auto px-4 py-8">
      <section class="text-center mb-12">
        <h1 class="text-4xl font-bold mb-4">Discover the Best New Startups and AI Products</h1>
        <p class="text-xl text-gray-600 max-w-3xl mx-auto">
          Explore our curated collection of innovative startups and AI products that are redefining industries and pushing technological boundaries
        </p>
        <div class="mt-6 flex justify-center">
          <a 
            href="/featured.html"
            class="inline-flex items-center px-6 py-3 border-2 border-black text-base font-medium rounded-md shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] text-black bg-yellow-400 hover:bg-yellow-500 focus:outline-none transition duration-150"
          >
            <span class="mr-2">⭐</span> Get Featured
          </a>
        </div>
      </section>

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
        <section aria-labelledby="startups-heading" class="mt-8 mb-12">
          <h2 id="startups-heading" class="text-2xl font-bold mb-6 border-b-2 border-black pb-2">Featured Startups & Products</h2>
          <p class="text-gray-600 mb-8">Discover the latest innovations in technology, AI, and more. Each product has been carefully selected for its unique approach and potential impact.</p>
          
          <!-- Group startups by launch date -->
          ${Object.keys(groupedStartups).sort().reverse().map(date => {
            const startupsForDate = groupedStartups[date];
            const formattedDate = new Date(date).toLocaleDateString('en-US', {
              weekday: 'long',
              month: 'long',
              day: 'numeric',
              year: 'numeric'
            });
            
            return html`
              <div class="mb-12">
                <h3 class="text-xl font-bold mb-4 bg-yellow-100 p-3 rounded-lg border-l-4 border-yellow-500">
                  <i class="fas fa-rocket mr-2"></i> Launched on ${formattedDate}
                  <span class="text-sm font-normal ml-2">(${startupsForDate.length} startup${startupsForDate.length !== 1 ? 's' : ''})</span>
                </h3>
                
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 mb-8">
                  ${startupsForDate.map(
                    (startup) => html`<${StartupCard} key=${startup.id} startup=${startup} />`
                  )}
                </div>
              </div>
            `;
          })}
          
          ${Object.keys(groupedStartups).length === 0 && html`
            <div class="text-center py-12 bg-gray-50 rounded-lg">
              <p class="text-gray-600">No startups have been launched yet. Check back soon!</p>
            </div>
          `}
          

        </section>
      `}
      ${selectedStartup &&
      html`<${StartupModal} startup=${selectedStartup} onClose=${closeModal} />`}
    </main>
  `;
};

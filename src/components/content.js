import { supabaseClient } from "../lib/supabase-client.js";
import { placeholderProjects } from "../lib/placeholder-data.js";
import { StartupCard } from "./startup-card.js";
import { StartupModal } from "./startup-modal.js";

// These are already defined globally in main.js
// Using the global variables directly

export const Content = () => {
  const [startups, setStartups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedStartup, setSelectedStartup] = useState(null);

  const fetchStartups = async () => {
    try {
      // Try to fetch from Supabase first
      try {
        const supabase = supabaseClient();
        const { data, error } = await supabase
          .from("startups")
          .select("*")
          .order("created_at", { ascending: false });

        if (!error && data && data.length > 0) {
          setStartups(data);
          
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
      setStartups(placeholderProjects);
      
      // Check for hash in URL with placeholder data
      const hash = window.location.hash.slice(1);
      if (hash) {
        const startup = placeholderProjects.find((g) => g.slug === hash);
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
        <h1 class="text-4xl font-bold mb-4">Discover the Best New Startups and AI Projects</h1>
        <p class="text-xl text-gray-600 max-w-3xl mx-auto">
          Explore our curated collection of innovative startups and AI projects that are redefining industries and pushing technological boundaries
        </p>
        <div class="mt-6 flex justify-center">
          <a 
            href="javascript:void(0)" 
            onclick="window.dispatchEvent(new CustomEvent('open-submit-form'));"
            class="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white bg-black hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-black transition duration-150"
          >
            <span class="mr-2">🚀</span> Submit Your Startup
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
          <h2 id="startups-heading" class="text-2xl font-bold mb-6 border-b-2 border-black pb-2">Featured Startups & Projects</h2>
          <p class="text-gray-600 mb-8">Discover the latest innovations in technology, AI, and more. Each project has been carefully selected for its unique approach and potential impact.</p>
          
          <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8 mb-12">
            ${startups.map(
              (startup) => html`<${StartupCard} key=${startup.id} startup=${startup} />`
            )}
          </div>
          

        </section>
      `}
      ${selectedStartup &&
      html`<${StartupModal} startup=${selectedStartup} onClose=${closeModal} />`}
    </main>
  `;
};

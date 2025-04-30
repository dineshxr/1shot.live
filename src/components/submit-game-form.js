import { supabaseClient } from '../lib/supabase-client.js';

export const SubmitGameForm = ({ isOpen, onClose }) => {
  const [formData, setFormData] = useState({
    url: "",
    xProfile: "",
    projectName: "",
    description: "",
    slug: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [turnstileToken, setTurnstileToken] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    
    // Load Turnstile script when component mounts
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    
    // Function to render Turnstile when script is loaded
    const renderTurnstile = () => {
      if (window.turnstile) {
        window.turnstile.render(".cf-turnstile", {
          sitekey: window.PUBLIC_ENV.turnstileSiteKey,
          theme: "light",
          callback: function (token) {
            setTurnstileToken(token);
          },
        });
      }
    };
    
    // Set up event listener for script load
    script.onload = renderTurnstile;
    
    document.body.appendChild(script);
    
    // Try to render immediately in case script is already loaded
    setTimeout(renderTurnstile, 1000);
    
    return () => {
      // Clean up
      if (script.parentNode) {
        document.body.removeChild(script);
      }
      
      // Reset Turnstile if it exists
      if (window.turnstile) {
        window.turnstile.reset();
      }
    };
  }, [isOpen]); // Re-run when modal opens

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!turnstileToken) {
        throw new Error(
          "Please complete the Turnstile challenge. If it's not showing, please refresh the page."
        );
      }

      // Initialize Supabase client
      const supabase = supabaseClient();

      // Submit to Supabase directly
      const { data, error } = await supabase
        .from('games')
        .insert([
          {
            title: formData.projectName,
            url: formData.url,
            description: formData.description,
            slug: formData.slug,
            author: {
              name: formData.xProfile,
              profile_url: `https://x.com/${formData.xProfile}`,
              avatar: `https://unavatar.io/twitter/${formData.xProfile}`,
            },
          },
        ])
        .select()
        .single();

      if (error) {
        throw new Error(error.message || "Failed to submit startup");
      }

      // Reset form
      setFormData({ url: "", xProfile: "", projectName: "", description: "", slug: "" });
      setTurnstileToken(null);
      // Reset the widget
      if (window.turnstile) {
        window.turnstile.reset();
      }
      onClose();
      
      // Trigger refresh of games list
      window.dispatchEvent(new Event("refresh-games"));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return html`
    <div
      class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
    >
      <div
        class="bg-white border-4 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 w-full max-w-md rounded relative"
      >
        <button
          onClick=${onClose}
          class="absolute top-2 right-2 text-black hover:text-gray-700"
          aria-label="Close"
        >
          <i class="fas fa-times text-xl"></i>
        </button>

        <h2 class="text-2xl font-bold mb-2 text-black">Submit Your Project</h2>
        <div class="mb-4 bg-yellow-300 p-3 border border-black rounded">
          <p class="font-bold flex items-center">
            <span class="mr-2">🚀</span> Launch Today, Get a 36+ DR Backlink
          </p>
        </div>

        ${error &&
        html`
          <div class="mb-4 p-3 bg-red-100 border-2 border-red-500 rounded">
            <p class="text-red-700">${error}</p>
          </div>
        `}

        <form onSubmit=${handleSubmit}>
          <div class="mb-4">
            <label class="block text-black font-bold mb-2" for="projectName">
              Project Name
            </label>
            <input
              type="text"
              id="projectName"
              name="projectName"
              placeholder="My Awesome Project"
              value=${formData.projectName}
              onChange=${handleChange}
              class="w-full px-3 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-blue-400"
              required
            />
          </div>

          <div class="mb-4">
            <label class="block text-black font-bold mb-2" for="url">
              Startup URL
            </label>
            <input
              type="url"
              id="url"
              name="url"
              value=${formData.url}
              onChange=${handleChange}
              class="w-full px-3 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="https://myproject.com"
              required
            />
          </div>

          <div class="mb-4">
            <label class="block text-black font-bold mb-2" for="slug">
              Slug
            </label>
            <input
              type="text"
              id="slug"
              name="slug"
              value=${formData.slug}
              onChange=${handleChange}
              class="w-full px-3 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="my-awesome-project"
              required
            />
            <div class="text-sm text-gray-500 mt-2">
              A unique identifier for your project that will be used in the URL (e.g. submit-hunt/#my-project)
            </div>
          </div>

          <div class="mb-4">
            <label class="block text-black font-bold mb-2" for="description">
              Description
            </label>
            <input
              type="text"
              id="description"
              name="description"
              value=${formData.description}
              onChange=${handleChange}
              class="w-full px-3 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="A short description of the startup"
            />
          </div>

          <div class="mb-6">
            <label class="block text-black font-bold mb-2" for="xProfile">
              X Username
            </label>
            <input
              type="text"
              id="xProfile"
              name="xProfile"
              value=${formData.xProfile}
              onChange=${handleChange}
              class="w-full px-3 py-2 border-2 border-black focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="jack"
              required
            />
            <div class="text-sm text-gray-500 mt-2">
              We need your X username so we know the creator of the startup. If you
              don't use X and want to add your startup, please open a PR in Github.
            </div>
          </div>

          <div class="mb-6">
            <div
              class="cf-turnstile"
            ></div>
          </div>

          <div class="flex justify-end">
            <button
              type="button"
              onClick=${onClose}
              class="mr-2 px-4 py-2 bg-gray-200 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-gray-300 font-bold"
              disabled=${loading}
            >
              Cancel
            </button>
            <button
              type="submit"
              class="neo-button px-4 py-2 bg-green-400 border-2 border-black shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] hover:bg-green-500 font-bold disabled:opacity-50"
              disabled=${loading}
            >
              ${loading ? "Submitting..." : "Submit"}
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
};

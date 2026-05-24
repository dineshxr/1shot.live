import { getCountryFlagEmoji } from "../lib/country-flag.js";
import { getSessionId } from "../lib/session-id.js";
import { initPresence } from "../lib/supabase-client.js";

export const OnlineVisitors = () => {
  const sessionId = useRef(getSessionId());
  const [visitors, setVisitors] = useState([]);
  const [showModal, setShowModal] = useState(false);

  const uniqueVisitors = useMemo(() => {
    // Create a Map to store the latest presence for each sessionId
    const visitorMap = new Map();
    
    visitors.forEach(visitor => {
      const currentVisitor = visitorMap.get(visitor.session_id);
      // Keep the most recent presence for each sessionId
      if (!currentVisitor || (visitor.timestamp > currentVisitor.timestamp)) {
        visitorMap.set(visitor.session_id, visitor);
      }
    });
    
    // Convert Map back to array and sort
    return Array.from(visitorMap.values()).sort((a, b) => {
      // Always put current user first
      if (a.session_id === sessionId.current) return -1;
      if (b.session_id === sessionId.current) return 1;
      // Then sort by timestamp (newest first)
      return (b.timestamp || 0) - (a.timestamp || 0);
    });
  }, [visitors]);

  useEffect(() => {
    // Initialize presence and track visitors
    const initializePresence = async () => {
      try {
        const countryFlag = getCountryFlagEmoji();
        await initPresence({
          sessionId: sessionId.current,
          countryFlag: countryFlag?.emoji,
          countryName: countryFlag?.name,
        });
      } catch (error) {
        console.error("Error initializing presence:", error);
      }
    };

    initializePresence();

    // Listen for presence updates
    const handlePresenceUpdate = (event) => {
      setVisitors(event.detail.visitors || []);
    };

    window.addEventListener("presence-update", handlePresenceUpdate);

    // Cleanup
    return () => {
      window.removeEventListener("presence-update", handlePresenceUpdate);
    };
  }, []);

  // If no visitors, show a placeholder
  if (!uniqueVisitors.length) {
    return html`
      <div
        class="inline-flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-200 rounded-full shadow-sm text-xs text-gray-500"
      >
        <span class="w-1.5 h-1.5 rounded-full bg-gray-300"></span>
        Waiting for visitors…
      </div>
    `;
  }

  return html`
    <div class="cursor-pointer">
      <div
        class="inline-flex items-center gap-3 px-3 py-1.5 bg-white border border-gray-200 rounded-full shadow-sm hover:border-gray-300 transition-colors"
        onClick=${() => setShowModal(true)}
      >
        <div class="flex items-center gap-1.5 text-xs font-medium text-gray-700">
          <span class="relative flex h-2 w-2">
            <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-60"></span>
            <span class="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
          </span>
          <span class="tabular-nums">${uniqueVisitors.length}</span>
          <span class="text-gray-500">online</span>
        </div>
        <ul class="list-none p-0 flex -space-x-1.5 items-center">
          ${uniqueVisitors.slice(0, 4).map((visitor, index) => {
            const visitorId = visitor?.session_id || "Unknown";
            const countryFlag = visitor?.country_flag;
            const isCurrentUser = visitorId === sessionId.current;
            const ringClass = isCurrentUser ? "ring-2 ring-green-500" : "ring-2 ring-white";

            return html`
              <li
                key=${index}
                class="group relative flex items-center justify-center bg-white rounded-full w-6 h-6 ${ringClass}"
              >
                <img
                  src="https://api.dicebear.com/9.x/pixel-art/svg?seed=${visitorId}"
                  alt="User"
                  class="w-full h-full rounded-full"
                />
                <div
                  class="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block bg-gray-900 text-white text-[11px] px-2 py-1 rounded-md whitespace-nowrap z-10"
                >
                  ${isCurrentUser ? "You" : visitorId.slice(0, 6)} ${countryFlag}
                </div>
              </li>
            `;
          })}
        </ul>
      </div>
    </div>

    ${showModal
      ? html`<${OnlineVisitorsModal}
          visitors=${uniqueVisitors}
          show=${showModal}
          setShow=${setShowModal}
          currentSessionId=${sessionId.current}
        />`
      : null}
  `;
};

function OnlineVisitorsModal({ visitors, show, setShow, currentSessionId }) {
  const uniqueCountries = new Set(visitors.map((v) => v.country_flag)).size;

  return html`<div
    class="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50"
    onClick=${(e) => {
      if (e.target === e.currentTarget) setShow(false);
    }}
  >
    <div
      class="bg-white border border-gray-200 shadow-xl p-6 w-full max-w-md rounded-2xl relative mx-4"
    >
      <button
        onClick=${() => setShow(false)}
        class="absolute top-3 right-3 w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
        aria-label="Close"
      >
        <i class="fas fa-times"></i>
      </button>

      <h2 class="text-lg font-semibold mb-1 text-gray-900">
        ${visitors.length} online visitors
      </h2>
      <p class="text-sm text-gray-500 mb-5">From ${uniqueCountries} ${uniqueCountries === 1 ? 'country' : 'countries'}</p>

      <div class="max-h-[60vh] overflow-y-auto -mx-2">
        <ul class="space-y-1">
          ${visitors.map((visitor, index) => {
            const visitorId = visitor?.session_id || "Unknown";
            const countryFlag = visitor?.country_flag;
            const countryName = visitor?.country_name;
            const isCurrentUser = visitorId === currentSessionId;

            return html`
              <li
                key=${index}
                class="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div class="flex-shrink-0">
                  <img
                    src="https://api.dicebear.com/9.x/pixel-art/svg?seed=${visitorId}"
                    alt="User"
                    class="w-10 h-10 rounded-full ${isCurrentUser
                      ? "ring-2 ring-green-500"
                      : "ring-1 ring-gray-200"}"
                  />
                </div>
                <div class="flex-grow min-w-0">
                  <div class="text-sm font-medium text-gray-900 truncate">
                    ${isCurrentUser ? "You" : visitorId.slice(0, 12)}
                  </div>
                  <div class="text-xs text-gray-500">${countryFlag} ${countryName}</div>
                </div>
              </li>
            `;
          })}
        </ul>
      </div>
    </div>
  </div> `;
}

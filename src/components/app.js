import { Header } from "./header.js";
import { Content } from "./content.js";
import { Footer } from "./footer.js";
import { SubmitStartupForm } from "./submit-startup-form.js";
import { StartupDetailPage } from "./startup-detail-page.js";

export const App = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [currentRoute, setCurrentRoute] = useState(window.location.pathname);

  const openForm = () => setIsFormOpen(true);
  const closeForm = () => setIsFormOpen(false);
  
  // Expose the openForm function globally
  window.openSubmitForm = openForm;

  useEffect(() => {
    const submitButton = document.getElementById("submit-startup-btn");
    submitButton?.addEventListener("click", openForm);
    
    // Add listener for custom event from the new CTA button
    window.addEventListener("open-submit-form", openForm);
    
    // Handle routing changes
    const handleRouteChange = () => {
      setCurrentRoute(window.location.pathname);
    };
    
    window.addEventListener('popstate', handleRouteChange);

    return () => {
      submitButton?.removeEventListener("click", openForm);
      window.removeEventListener("open-submit-form", openForm);
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, []);
  
  // Check if the current route is a startup detail page
  const isStartupDetailPage = currentRoute.startsWith('/startup/');

  return html`
    <div class="bg-yellow-50 min-h-screen">
      <${Header} />
      ${isStartupDetailPage
        ? html`<${StartupDetailPage} />`
        : html`<${Content} />`
      }
      <${Footer} />
      <${SubmitStartupForm} isOpen=${isFormOpen} onClose=${closeForm} />
    </div>
  `;
};

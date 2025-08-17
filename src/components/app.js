import { Header } from "./header.js";
import { Content } from "./content.js";
import { Footer } from "./footer.js";
import { SubmitStartupForm } from "./submit-startup-form.js";
import { StartupDetailPage } from "./startup-detail-page.js";
import { LoginModal } from "./login-modal.js";
import { auth } from "../lib/auth.js";

/* global useState, useEffect, html */

export const App = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [currentRoute, setCurrentRoute] = useState(window.location.pathname);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  // Handle authentication state changes
  useEffect(() => {
    // Subscribe to auth state changes
    const unsubscribe = auth.subscribe((authState) => {
      setUser(authState.user);
      setAuthLoading(authState.loading);
    });

    // Set initial user state
    const currentAuthState = auth.getAuthState();
    setUser(currentAuthState.user);
    setAuthLoading(currentAuthState.loading);

    return unsubscribe;
  }, []);

  // Handle form opening with authentication check
  const openForm = () => {
    if (auth.isAuthenticated()) {
      setIsFormOpen(true);
    } else {
      setIsLoginModalOpen(true);
    }
  };

  const closeForm = () => setIsFormOpen(false);
  const closeLoginModal = () => setIsLoginModalOpen(false);
  
  // Handle successful login
  const handleLoginSuccess = () => {
    setIsLoginModalOpen(false);
    // Open the form after successful login
    setIsFormOpen(true);
  };

  // Expose functions globally
  window.openSubmitForm = openForm;

  useEffect(() => {
    const submitButton = document.getElementById("submit-startup-btn");
    submitButton?.addEventListener("click", openForm);
    
    // Add listener for custom event from the new CTA button
    window.addEventListener("open-submit-form", openForm);
    
    // Add listener for login modal from upvote button
    window.addEventListener("open-login-modal", () => {
      setIsLoginModalOpen(true);
    });
    
    // Handle routing changes
    const handleRouteChange = () => {
      setCurrentRoute(window.location.pathname);
    };
    
    window.addEventListener('popstate', handleRouteChange);

    return () => {
      submitButton?.removeEventListener("click", openForm);
      window.removeEventListener("open-submit-form", openForm);
      window.removeEventListener("open-login-modal", () => {
        setIsLoginModalOpen(true);
      });
      window.removeEventListener('popstate', handleRouteChange);
    };
  }, []);
  
  // Check if the current route is a startup detail page
  const isStartupDetailPage = currentRoute.startsWith('/startup/');

  return html`
    <div class="bg-yellow-50 min-h-screen">
      <${Header} user=${user} />
      ${isStartupDetailPage
        ? html`<${StartupDetailPage} />`
        : html`<${Content} />`
      }
      <${Footer} />
      <${SubmitStartupForm} isOpen=${isFormOpen} onClose=${closeForm} />
      <${LoginModal} 
        isOpen=${isLoginModalOpen} 
        onClose=${closeLoginModal}
        onLoginSuccess=${handleLoginSuccess}
      />
    </div>
  `;
};

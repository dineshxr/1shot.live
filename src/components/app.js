import { Header } from "./header.js";
import { Content } from "./content.js";
import { Footer } from "./footer.js";
import { Sidebar } from "./sidebar.js";
import { SubmitStartupForm } from "./submit-startup-form.js";
import { StartupDetailPage } from "./startup-detail-page.js";
import { LoginModal } from "./login-modal.js";
import { auth } from "../lib/auth.js";

/* global useState, useEffect, html */

export const App = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  const [currentRoute, setCurrentRoute] = useState('');
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [startups, setStartups] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('trending');
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

  // Set initial route on component mount
  useEffect(() => {
    setCurrentRoute(window.location.pathname);
  }, []);

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
    // Don't automatically open form - let user decide what to do next
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
  
  // Debug logging
  console.log('App: Current route:', currentRoute);
  console.log('App: Is startup detail page:', isStartupDetailPage);

  const handleCategoryFilter = (category) => {
    setSelectedCategory(category);
  };

  const handleSortChange = (sort) => {
    setSortBy(sort);
  };

  const handleSearchChange = (query) => {
    setSearchQuery(query);
  };

  return html`
    <div class="bg-gray-50 min-h-screen">
      ${isStartupDetailPage
        ? html`
          <div class="bg-yellow-50 min-h-screen">
            <${Header} user=${user} />
            <${StartupDetailPage} />
            <${Footer} />
          </div>
        `
        : html`
          <div class="bg-gray-50 min-h-screen">
            <${Header} 
              user=${user} 
              onMobileMenuToggle=${() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
              showMobileMenuButton=${true}
            />
            
            <!-- Mobile Sidebar Overlay -->
            ${isMobileSidebarOpen && html`
              <div class="fixed inset-0 z-50 lg:hidden">
                <div class="fixed inset-0 bg-black bg-opacity-50" onClick=${() => setIsMobileSidebarOpen(false)}></div>
                <div class="fixed left-0 top-0 h-full w-80 bg-white">
                  <${Sidebar} 
                    startups=${startups}
                    onCategoryFilter=${(category) => {
                      handleCategoryFilter(category);
                      setIsMobileSidebarOpen(false);
                    }}
                    onSortChange=${(sort) => {
                      handleSortChange(sort);
                      setIsMobileSidebarOpen(false);
                    }}
                    selectedCategory=${selectedCategory}
                  />
                </div>
              </div>
            `}
            
            <!-- Main Content Area -->
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
              <div class="flex gap-8">
                <!-- Desktop Sidebar -->
                <div class="hidden lg:block w-80 flex-shrink-0">
                  <${Sidebar} 
                    startups=${startups}
                    onCategoryFilter=${handleCategoryFilter}
                    onSortChange=${handleSortChange}
                    onSearchChange=${handleSearchChange}
                    selectedCategory=${selectedCategory}
                  />
                </div>
                
                <!-- Main Content -->
                <div class="flex-1 min-w-0">
                  <${Content} 
                    user=${user} 
                    onStartupsChange=${setStartups}
                    selectedCategory=${selectedCategory}
                    sortBy=${sortBy}
                    searchQuery=${searchQuery}
                    onCategoryFilter=${handleCategoryFilter}
                    onSortChange=${handleSortChange}
                  />
                </div>
              </div>
            </div>
            
            <${Footer} />
          </div>
        `
      }
      <${SubmitStartupForm} isOpen=${isFormOpen} onClose=${closeForm} />
      <${LoginModal} 
        isOpen=${isLoginModalOpen} 
        onClose=${closeLoginModal}
        onLoginSuccess=${handleLoginSuccess}
      />
    </div>
  `;
};

import { Header } from "./header.js";
import { Content } from "./content.js";
import { Footer } from "./footer.js";
import { Sidebar } from "./sidebar.js";
import { RightSidebar } from "./right-sidebar.js";
import { SubmitStartupForm } from "./submit-startup-form.js";
import { StartupDetailPage } from "./startup-detail-page.js";
import { LoginModal } from "./login-modal.js";
import { BlogPage } from "./blog-page.js";
import { BlogPostPage } from "./blog-post-page.js";
import { auth } from "../lib/auth.js";

/* global useState, useEffect, html */

export const App = () => {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoginModalOpen, setIsLoginModalOpen] = useState(false);
  // Initialize currentRoute immediately from window.location.pathname
  const [currentRoute, setCurrentRoute] = useState(() => {
    if (typeof window !== 'undefined') {
      return window.location.pathname;
    }
    return '';
  });
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [startups, setStartups] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [sortBy, setSortBy] = useState('trending');
  const [searchQuery, setSearchQuery] = useState('');
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);

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
  
  // Check route types
  const isStartupDetailPage = currentRoute.startsWith('/startup/');
  const isBlogPostPage = currentRoute.startsWith('/blog/') && currentRoute.length > 6;
  const isBlogPage = currentRoute === '/blog' || currentRoute === '/blog/';
  
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
    <div class="min-h-screen" style="background-color: var(--sh-bg);">
      ${isStartupDetailPage
        ? html`
          <div class="min-h-screen" style="background-color: var(--sh-bg);">
            <${Header} user=${user} />
            <${StartupDetailPage} />
            <${Footer} />
          </div>
        `
        : isBlogPostPage
        ? html`
          <div class="min-h-screen bg-white">
            <${Header} user=${user} />
            <${BlogPostPage} />
            <${Footer} />
          </div>
        `
        : isBlogPage
        ? html`
          <div class="min-h-screen bg-white">
            <${Header} user=${user} />
            <${BlogPage} />
            <${Footer} />
          </div>
        `
        : html`
          <div class="min-h-screen" style="background-color: var(--sh-bg);">
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
            
            <!-- Main Content Area: full-width 3-column rail layout -->
            <div class="w-full px-4 sm:px-6 lg:px-8 xl:px-12 py-8">
              <div class="grid gap-6 lg:gap-8 grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] xl:grid-cols-[280px_minmax(0,1fr)_320px]">
                <!-- Desktop Left Sidebar -->
                <div class="hidden lg:block">
                  <${Sidebar}
                    startups=${startups}
                    onCategoryFilter=${handleCategoryFilter}
                    onSortChange=${handleSortChange}
                    onSearchChange=${handleSearchChange}
                    selectedCategory=${selectedCategory}
                  />
                </div>

                <!-- Main Content -->
                <div class="min-w-0">
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

                <!-- Desktop Right Sidebar -->
                <div class="hidden xl:block">
                  <${RightSidebar} startups=${startups} />
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

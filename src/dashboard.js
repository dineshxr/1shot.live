import { auth } from './lib/auth.js';
import { supabaseClient } from './lib/supabase-client.js';

class Dashboard {
    constructor() {
        this.currentUser = null;
        this.listings = [];
        this.upvotedStartups = [];
        this.editingListing = null;
        this.init();
    }

    async init() {
        // Wait for auth to initialize
        await this.checkAuthentication();
        this.setupEventListeners();
        
        // Listen for auth state changes
        auth.onAuthStateChange((user) => {
            this.currentUser = user;
            if (user) {
                this.showDashboard();
                this.loadUserListings();
            } else {
                this.showNotAuthenticated();
            }
        });
    }

    async checkAuthentication() {
        try {
            const user = await auth.getCurrentUser();
            this.currentUser = user;
            
            if (user) {
                this.showDashboard();
                await this.loadUserListings();
            } else {
                this.showNotAuthenticated();
            }
        } catch (error) {
            console.error('Auth check failed:', error);
            this.showNotAuthenticated();
        }
    }

    showDashboard() {
        document.getElementById('auth-loading').classList.add('hidden');
        document.getElementById('not-authenticated').classList.add('hidden');
        document.getElementById('dashboard-content').classList.remove('hidden');
        
        // Show user email in nav
        if (this.currentUser?.email) {
            document.getElementById('user-email').textContent = this.currentUser.email;
        }
    }

    showNotAuthenticated() {
        document.getElementById('auth-loading').classList.add('hidden');
        document.getElementById('dashboard-content').classList.add('hidden');
        document.getElementById('not-authenticated').classList.remove('hidden');
    }

    async loadUserListings() {
        try {
            document.getElementById('listings-loading').classList.remove('hidden');
            document.getElementById('no-listings').classList.add('hidden');
            document.getElementById('listings-grid').classList.add('hidden');

            const supabase = supabaseClient();
            
            // Get user's listings based on their email
            const { data, error } = await supabase
                .from('startups')
                .select('*')
                .contains('author', { email: this.currentUser.email })
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Error fetching listings:', error);
                throw error;
            }

            this.listings = data || [];
            
            // Also load upvoted startups
            await this.loadUpvotedStartups();
            
            this.updateStats();
            this.renderListings();
            this.renderUpvotedStartups();

        } catch (error) {
            console.error('Failed to load listings:', error);
            this.showError('Failed to load your listings. Please try again.');
        } finally {
            document.getElementById('listings-loading').classList.add('hidden');
        }
    }

    updateStats() {
        const totalListings = this.listings.length;
        const featuredListings = this.listings.filter(listing => listing.plan === 'premium').length;
        
        // Calculate monthly listings (current month)
        const currentMonth = new Date().getMonth();
        const currentYear = new Date().getFullYear();
        const monthlyListings = this.listings.filter(listing => {
            const listingDate = new Date(listing.created_at);
            return listingDate.getMonth() === currentMonth && listingDate.getFullYear() === currentYear;
        }).length;

        document.getElementById('total-listings').textContent = totalListings;
        document.getElementById('featured-listings').textContent = featuredListings;
        document.getElementById('monthly-listings').textContent = monthlyListings;
        
        // Update upvoted count
        const upvotedCount = this.upvotedStartups.length;
        const upvotedElement = document.getElementById('upvoted-count');
        if (upvotedElement) {
            upvotedElement.textContent = upvotedCount;
        }
    }

    async loadUpvotedStartups() {
        try {
            const supabase = supabaseClient();
            const { data, error } = await supabase.rpc('get_user_upvoted_startups');

            if (error) {
                console.error('Error fetching upvoted startups:', error);
                return;
            }

            this.upvotedStartups = data || [];
        } catch (error) {
            console.error('Failed to load upvoted startups:', error);
        }
    }

    renderUpvotedStartups() {
        const container = document.getElementById('upvoted-startups-grid');
        if (!container) return;

        if (this.upvotedStartups.length === 0) {
            container.innerHTML = `
                <div class="col-span-full text-center py-8 text-gray-500">
                    <i class="fas fa-heart text-4xl mb-4"></i>
                    <p>You haven't upvoted any startups yet.</p>
                    <p class="text-sm">Visit the homepage to discover and upvote startups!</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.upvotedStartups.map(startup => this.createUpvotedStartupCard(startup)).join('');
    }

    createUpvotedStartupCard(startup) {
        const votedDate = new Date(startup.voted_at).toLocaleDateString();
        
        return `
            <div class="startup-card bg-white border-2 border-black brutalist-shadow p-4">
                <div class="flex items-start justify-between mb-2">
                    <h3 class="font-bold text-lg flex-1 mr-2">${startup.name}</h3>
                    ${startup.daily_rank && startup.daily_rank <= 3 ? `
                        <span class="bg-yellow-400 border border-black px-2 py-1 text-xs font-bold">
                            <i class="fas fa-trophy mr-1"></i>#${startup.daily_rank}
                        </span>
                    ` : ''}
                </div>
                
                <p class="text-gray-600 text-sm mb-3 line-clamp-2">
                    ${startup.tagline || 'No tagline provided'}
                </p>
                
                <div class="space-y-2 mb-4">
                    <div class="flex items-center text-sm text-gray-600">
                        <i class="fas fa-heart mr-2 text-red-500"></i>
                        <span>${startup.upvote_count} upvotes</span>
                    </div>
                    <div class="flex items-center text-sm text-gray-600">
                        <i class="fas fa-calendar mr-2"></i>
                        <span>Upvoted: ${votedDate}</span>
                    </div>
                </div>
                
                <div class="flex space-x-2">
                    <a href="/startup/${startup.slug}" target="_blank"
                       class="flex-1 px-3 py-2 bg-green-400 border-2 border-black brutalist-shadow hover:bg-green-500 font-bold text-sm text-center">
                        <i class="fas fa-eye mr-1"></i>View
                    </a>
                    <a href="${startup.url}" target="_blank"
                       class="flex-1 px-3 py-2 bg-blue-400 border-2 border-black brutalist-shadow hover:bg-blue-500 font-bold text-sm text-center">
                        <i class="fas fa-external-link-alt mr-1"></i>Visit
                    </a>
                </div>
            </div>
        `;
    }

    renderListings() {
        const grid = document.getElementById('listings-grid');
        const noListings = document.getElementById('no-listings');

        if (this.listings.length === 0) {
            noListings.classList.remove('hidden');
            grid.classList.add('hidden');
            return;
        }

        noListings.classList.add('hidden');
        grid.classList.remove('hidden');

        grid.innerHTML = this.listings.map(listing => this.createListingCard(listing)).join('');
    }

    createListingCard(listing) {
        const createdDate = new Date(listing.created_at).toLocaleDateString();
        const launchDate = listing.launch_date ? new Date(listing.launch_date).toLocaleDateString() : 'Not set';
        const isPremium = listing.plan === 'premium';
        
        return `
            <div class="startup-card bg-white border-2 border-black brutalist-shadow p-4">
                ${listing.screenshot_url ? `
                    <img src="${listing.screenshot_url}" alt="${listing.title}" 
                         class="w-full h-32 object-cover border-2 border-black mb-3">
                ` : `
                    <div class="w-full h-32 bg-gray-200 border-2 border-black mb-3 flex items-center justify-center">
                        <i class="fas fa-image text-gray-400 text-2xl"></i>
                    </div>
                `}
                
                <div class="flex items-start justify-between mb-2">
                    <h3 class="font-bold text-lg flex-1 mr-2">${listing.title}</h3>
                    ${isPremium ? `
                        <span class="bg-yellow-400 border border-black px-2 py-1 text-xs font-bold">
                            <i class="fas fa-star mr-1"></i>FEATURED
                        </span>
                    ` : `
                        <span class="bg-green-400 border border-black px-2 py-1 text-xs font-bold">
                            FREE
                        </span>
                    `}
                </div>
                
                <p class="text-gray-600 text-sm mb-3 line-clamp-2">
                    ${listing.description || 'No description provided'}
                </p>
                
                <div class="space-y-2 mb-4">
                    <div class="flex items-center text-sm text-gray-600">
                        <i class="fas fa-link mr-2"></i>
                        <a href="${listing.url}" target="_blank" class="hover:text-blue-600 truncate">
                            ${listing.url}
                        </a>
                    </div>
                    <div class="flex items-center text-sm text-gray-600">
                        <i class="fas fa-calendar mr-2"></i>
                        <span>Created: ${createdDate}</span>
                    </div>
                    <div class="flex items-center text-sm text-gray-600">
                        <i class="fas fa-rocket mr-2"></i>
                        <span>Launch: ${launchDate}</span>
                    </div>
                </div>
                
                <div class="flex space-x-2">
                    <button onclick="dashboard.editListing('${listing.id}')" 
                            class="flex-1 px-3 py-2 bg-blue-400 border-2 border-black brutalist-shadow hover:bg-blue-500 font-bold text-sm">
                        <i class="fas fa-edit mr-1"></i>Edit
                    </button>
                    ${!isPremium ? `
                        <button onclick="dashboard.upgradeListing('${listing.id}')" 
                                class="flex-1 px-3 py-2 bg-yellow-400 border-2 border-black brutalist-shadow hover:bg-yellow-500 font-bold text-sm">
                            <i class="fas fa-star mr-1"></i>Upgrade
                        </button>
                    ` : ''}
                    <a href="/startup/${listing.slug}" target="_blank"
                       class="flex-1 px-3 py-2 bg-green-400 border-2 border-black brutalist-shadow hover:bg-green-500 font-bold text-sm text-center">
                        <i class="fas fa-eye mr-1"></i>View
                    </a>
                </div>
            </div>
        `;
    }

    upgradeListing(listingId) {
        const listing = this.listings.find(l => l.id === listingId);
        if (!listing) return;

        // Redirect to featured upgrade payment page with listing ID
        const upgradeUrl = `https://submit.gumroad.com/l/featured?listing_id=${listingId}`;
        window.open(upgradeUrl, '_blank');
        
        // Track upgrade attempt
        if (typeof window.gtag === 'function') {
            window.gtag('event', 'upgrade_attempt', {
                event_category: 'listing',
                event_label: listing.title,
                listing_id: listingId
            });
        }
    }

    editListing(listingId) {
        const listing = this.listings.find(l => l.id === listingId);
        if (!listing) return;

        this.editingListing = listing;
        
        // Populate form
        document.getElementById('edit-id').value = listing.id;
        document.getElementById('edit-title').value = listing.title;
        document.getElementById('edit-url').value = listing.url;
        document.getElementById('edit-description').value = listing.description || '';
        document.getElementById('edit-slug').value = listing.slug;
        
        // Show modal
        document.getElementById('edit-modal').classList.remove('hidden');
    }

    closeEditModal() {
        document.getElementById('edit-modal').classList.add('hidden');
        this.editingListing = null;
    }

    async saveChanges(formData) {
        try {
            const supabase = supabaseClient();
            
            const { data, error } = await supabase
                .from('startups')
                .update({
                    title: formData.title,
                    url: formData.url,
                    description: formData.description,
                    slug: formData.slug,
                    updated_at: new Date().toISOString()
                })
                .eq('id', this.editingListing.id)
                .select()
                .single();

            if (error) {
                if (error.code === '23505' && error.message.includes('startups_slug_key')) {
                    throw new Error('This slug is already taken. Please choose a different one.');
                }
                throw error;
            }

            // Update local listing
            const index = this.listings.findIndex(l => l.id === this.editingListing.id);
            if (index !== -1) {
                this.listings[index] = { ...this.listings[index], ...data };
                this.renderListings();
            }

            this.closeEditModal();
            this.showSuccess('Listing updated successfully!');

        } catch (error) {
            console.error('Error updating listing:', error);
            this.showError(error.message || 'Failed to update listing. Please try again.');
        }
    }

    async logout() {
        try {
            await auth.signOut();
            window.location.href = '/';
        } catch (error) {
            console.error('Logout failed:', error);
            this.showError('Failed to logout. Please try again.');
        }
    }

    setupEventListeners() {
        // Logout button
        document.getElementById('logout-btn').addEventListener('click', () => {
            this.logout();
        });

        // Modal close buttons
        document.getElementById('close-modal').addEventListener('click', () => {
            this.closeEditModal();
        });
        
        document.getElementById('cancel-edit').addEventListener('click', () => {
            this.closeEditModal();
        });

        // Click outside modal to close
        document.getElementById('edit-modal').addEventListener('click', (e) => {
            if (e.target.id === 'edit-modal') {
                this.closeEditModal();
            }
        });

        // Edit form submission
        document.getElementById('edit-form').addEventListener('submit', (e) => {
            e.preventDefault();
            
            const formData = {
                title: document.getElementById('edit-title').value.trim(),
                url: document.getElementById('edit-url').value.trim(),
                description: document.getElementById('edit-description').value.trim(),
                slug: document.getElementById('edit-slug').value.trim()
            };

            // Basic validation
            if (!formData.title || !formData.url || !formData.slug) {
                this.showError('Please fill in all required fields.');
                return;
            }

            // URL validation
            try {
                new URL(formData.url);
            } catch {
                this.showError('Please enter a valid URL.');
                return;
            }

            // Slug validation
            if (!/^[a-z0-9-]+$/.test(formData.slug)) {
                this.showError('Slug can only contain lowercase letters, numbers, and hyphens.');
                return;
            }

            this.saveChanges(formData);
        });

        // Auto-generate slug from title
        document.getElementById('edit-title').addEventListener('input', (e) => {
            const title = e.target.value;
            const slugField = document.getElementById('edit-slug');
            
            // Only auto-generate if slug is empty or matches the previous title
            if (!slugField.value || slugField.value === this.generateSlug(this.editingListing?.title || '')) {
                slugField.value = this.generateSlug(title);
            }
        });
    }

    generateSlug(title) {
        return title
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .substring(0, 50);
    }

    showError(message) {
        // Create a simple error notification
        const notification = document.createElement('div');
        notification.className = 'fixed top-4 right-4 bg-red-400 border-2 border-black brutalist-shadow p-4 z-50';
        notification.innerHTML = `
            <div class="flex items-center">
                <i class="fas fa-exclamation-triangle mr-2"></i>
                <span>${message}</span>
                <button onclick="this.parentElement.parentElement.remove()" class="ml-4 text-black hover:text-gray-700">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        document.body.appendChild(notification);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }

    showSuccess(message) {
        // Create a simple success notification
        const notification = document.createElement('div');
        notification.className = 'fixed top-4 right-4 bg-green-400 border-2 border-black brutalist-shadow p-4 z-50';
        notification.innerHTML = `
            <div class="flex items-center">
                <i class="fas fa-check-circle mr-2"></i>
                <span>${message}</span>
                <button onclick="this.parentElement.parentElement.remove()" class="ml-4 text-black hover:text-gray-700">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        document.body.appendChild(notification);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 3000);
    }
}

// Initialize dashboard
const dashboard = new Dashboard();

// Make dashboard available globally for onclick handlers
window.dashboard = dashboard;

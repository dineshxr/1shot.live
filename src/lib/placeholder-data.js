// Placeholder data for Submit Hunt
// This data can be used to populate your Supabase database or used directly in the application

export const placeholderProjects = [
  {
    id: 1,
    title: "GrayBlocks",
    slug: "grayblocks",
    description: "2700+ blocks & components to build premium websites without code.",
    url: "https://grayblocks.io",
    featured: true,
    upvotes: 124,
    author: {
      name: "blockmaster",
      profile_url: "https://x.com/blockmaster",
      avatar: "https://ui-avatars.com/api/?name=GB&background=6366F1&color=fff"
    },
    created_at: new Date().toISOString(),
    images: ["https://placehold.co/600x400/6366F1/FFFFFF?text=GrayBlocks"]
  },
  {
    id: 2,
    title: "Syntha AI",
    slug: "syntha-ai",
    description: "Generate, explain, convert, document, and optimize your code with AI.",
    url: "https://synthaai.dev",
    featured: false,
    upvotes: 137,
    author: {
      name: "codesmith",
      profile_url: "https://x.com/codesmith",
      avatar: "https://ui-avatars.com/api/?name=SA&background=10B981&color=fff"
    },
    created_at: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
    images: ["https://placehold.co/600x400/10B981/FFFFFF?text=Syntha+AI"]
  },
  {
    id: 3,
    title: "Dreamchanted",
    slug: "dreamchanted",
    description: "Turn boring photos into magical art with our AI-powered transformation tool.",
    url: "https://dreamchanted.ai",
    featured: false,
    upvotes: 129,
    author: {
      name: "artmagic",
      profile_url: "https://x.com/artmagic",
      avatar: "https://ui-avatars.com/api/?name=DC&background=8B5CF6&color=fff"
    },
    created_at: new Date(Date.now() - 172800000).toISOString(), // 2 days ago
    images: ["https://placehold.co/600x400/8B5CF6/FFFFFF?text=Dreamchanted"]
  },
  {
    id: 4,
    title: "Capgo",
    slug: "capgo",
    description: "Instant updates for Capacitor. Ship updates, fixes, changes, and more without App Store approval.",
    url: "https://capgo.app",
    featured: false,
    upvotes: 124,
    author: {
      name: "mobiledev",
      profile_url: "https://x.com/mobiledev",
      avatar: "https://ui-avatars.com/api/?name=CG&background=3B82F6&color=fff"
    },
    created_at: new Date(Date.now() - 259200000).toISOString(), // 3 days ago
    images: ["https://placehold.co/600x400/3B82F6/FFFFFF?text=Capgo"]
  },
  {
    id: 5,
    title: "Saidar",
    slug: "saidar",
    description: "Your AI secretary for 50+ apps. Automate workflows and manage your digital life.",
    url: "https://saidar.ai",
    featured: false,
    upvotes: 120,
    author: {
      name: "aiassistant",
      profile_url: "https://x.com/aiassistant",
      avatar: "https://ui-avatars.com/api/?name=SD&background=000000&color=fff"
    },
    created_at: new Date(Date.now() - 345600000).toISOString(), // 4 days ago
    images: ["https://placehold.co/600x400/000000/FFFFFF?text=Saidar"]
  },
  {
    id: 6,
    title: "Guidejar",
    slug: "guidejar",
    description: "Interactive product demos that turn curiosity into signups. Boost conversions instantly.",
    url: "https://guidejar.com",
    featured: false,
    upvotes: 119,
    author: {
      name: "demomaster",
      profile_url: "https://x.com/demomaster",
      avatar: "https://ui-avatars.com/api/?name=GJ&background=EC4899&color=fff"
    },
    created_at: new Date(Date.now() - 432000000).toISOString(), // 5 days ago
    images: ["https://placehold.co/600x400/EC4899/FFFFFF?text=Guidejar"]
  },
  {
    id: 7,
    title: "Supersaas",
    slug: "supersaas",
    description: "A fast, modern, and easy to use Nuxt 3 starter kit. Launch your next project in minutes.",
    url: "https://supersaas.dev",
    featured: false,
    upvotes: 102,
    author: {
      name: "nuxtdev",
      profile_url: "https://x.com/nuxtdev",
      avatar: "https://ui-avatars.com/api/?name=SS&background=374151&color=fff"
    },
    created_at: new Date(Date.now() - 518400000).toISOString(), // 6 days ago
    images: ["https://placehold.co/600x400/374151/FFFFFF?text=Supersaas"]
  },
  {
    id: 8,
    title: "AIBlogBot",
    slug: "aiblogbot",
    description: "Use AI to auto-generate long, highly-engaging and SEO-friendly blog posts in seconds.",
    url: "https://aiblogbot.com",
    featured: false,
    upvotes: 71,
    author: {
      name: "contentcreator",
      profile_url: "https://x.com/contentcreator",
      avatar: "https://ui-avatars.com/api/?name=AB&background=4F46E5&color=fff"
    },
    created_at: new Date(Date.now() - 604800000).toISOString(), // 7 days ago
    images: ["https://placehold.co/600x400/4F46E5/FFFFFF?text=AIBlogBot"]
  },
  {
    id: 9,
    title: "PhotoGuru",
    slug: "photoguru",
    description: "Transform your daily selfie photos into professional studio quality portraits with AI.",
    url: "https://photoguru.ai",
    featured: false,
    upvotes: 67,
    author: {
      name: "photopro",
      profile_url: "https://x.com/photopro",
      avatar: "https://ui-avatars.com/api/?name=PG&background=059669&color=fff"
    },
    created_at: new Date(Date.now() - 691200000).toISOString(), // 8 days ago
    images: ["https://placehold.co/600x400/059669/FFFFFF?text=PhotoGuru"]
  }
];

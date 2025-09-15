const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Supabase client with environment variables
const supabaseUrl = process.env.SUPABASE_URL || 'https://lbayphzxmdtdmrqmeomt.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Category mapping based on description keywords
const categoryMappings = [
  {
    category: 'AI & Machine Learning',
    keywords: ['AI', 'artificial intelligence', 'machine learning', 'ML', 'neural', 'GPT', 'chatbot', 'automation', 'LLM', 'deep learning']
  },
  {
    category: 'SaaS & Tools',
    keywords: ['SaaS', 'software as a service', 'platform', 'tool', 'service', 'dashboard', 'analytics', 'CRM', 'management']
  },
  {
    category: 'E-commerce',
    keywords: ['ecommerce', 'e-commerce', 'shop', 'store', 'marketplace', 'selling', 'buying', 'payment', 'checkout', 'retail']
  },
  {
    category: 'Productivity',
    keywords: ['productivity', 'workflow', 'efficiency', 'task', 'project management', 'organization', 'planning', 'calendar', 'note']
  },
  {
    category: 'Developer Tools',
    keywords: ['developer', 'dev', 'code', 'programming', 'API', 'SDK', 'framework', 'library', 'debugging', 'testing']
  },
  {
    category: 'Design & Creative',
    keywords: ['design', 'UI', 'UX', 'creative', 'graphics', 'visual', 'prototype', 'mockup', 'branding', 'logo']
  },
  {
    category: 'Marketing',
    keywords: ['marketing', 'advertising', 'promotion', 'SEO', 'social media', 'email marketing', 'campaign', 'lead generation']
  },
  {
    category: 'Finance',
    keywords: ['finance', 'financial', 'money', 'investment', 'banking', 'crypto', 'trading', 'accounting', 'budget']
  },
  {
    category: 'Health & Fitness',
    keywords: ['health', 'fitness', 'wellness', 'medical', 'exercise', 'nutrition', 'diet', 'workout', 'mental health']
  },
  {
    category: 'Education',
    keywords: ['education', 'learning', 'course', 'training', 'tutorial', 'teaching', 'student', 'knowledge', 'skill']
  },
  {
    category: 'Social',
    keywords: ['social', 'community', 'networking', 'chat', 'messaging', 'communication', 'collaboration', 'team']
  },
  {
    category: 'Gaming',
    keywords: ['game', 'gaming', 'play', 'entertainment', 'fun', 'arcade', 'puzzle', 'strategy', 'multiplayer']
  },
  {
    category: 'Mobile Apps',
    keywords: ['mobile', 'app', 'iOS', 'Android', 'smartphone', 'tablet', 'mobile app']
  },
  {
    category: 'Web Apps',
    keywords: ['web app', 'web application', 'browser', 'online', 'website', 'web-based']
  },
  {
    category: 'Chrome Extension',
    keywords: ['chrome extension', 'browser extension', 'chrome', 'extension', 'add-on']
  },
  {
    category: 'API/Service',
    keywords: ['API', 'service', 'integration', 'webhook', 'REST', 'GraphQL', 'microservice']
  },
  {
    category: 'Hardware',
    keywords: ['hardware', 'device', 'IoT', 'sensor', 'gadget', 'electronics', 'physical']
  }
];

function categorizeStartup(description, title) {
  const text = `${description} ${title}`.toLowerCase();
  
  for (const mapping of categoryMappings) {
    for (const keyword of mapping.keywords) {
      if (text.includes(keyword.toLowerCase())) {
        return mapping.category;
      }
    }
  }
  
  return 'Other';
}

async function updateCategories() {
  try {
    console.log('Fetching startups without categories...');
    
    // Get all startups that don't have a category
    const { data: startups, error } = await supabase
      .from('startups')
      .select('id, title, description, category')
      .or('category.is.null,category.eq.');
    
    if (error) {
      throw error;
    }
    
    console.log(`Found ${startups.length} startups to categorize`);
    
    // Update each startup with a category
    for (const startup of startups) {
      const category = categorizeStartup(startup.description || '', startup.title || '');
      
      const { error: updateError } = await supabase
        .from('startups')
        .update({ category })
        .eq('id', startup.id);
      
      if (updateError) {
        console.error(`Error updating startup ${startup.id}:`, updateError);
      } else {
        console.log(`Updated "${startup.title}" with category: ${category}`);
      }
    }
    
    console.log('Category update complete!');
    
  } catch (error) {
    console.error('Error updating categories:', error);
  }
}

// Run the update
updateCategories();

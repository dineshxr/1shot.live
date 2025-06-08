// Script to run the screenshot update service
const dotenv = require('dotenv');
dotenv.config();

// We need to create a browser-like environment since the code uses browser APIs
global.window = {
  PUBLIC_ENV: {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY
  }
};

console.log('Using Supabase URL:', process.env.SUPABASE_URL);

// Mock fetch API
global.fetch = async (url) => {
  console.log(`Mocking fetch to: ${url}`);
  return {
    ok: true,
    text: async () => 'https://mock-screenshot-url.com/image.png',
    blob: async () => ({})
  };
};

// Mock URL class
global.URL = class URL {
  constructor(base, path) {
    this.base = base;
    this.path = path;
    this.searchParams = {
      append: (key, value) => {
        console.log(`Adding param: ${key}=${value}`);
      }
    };
  }
  
  toString() {
    return this.base;
  }
};

// Create a simple admin page to run the screenshot service
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Create a temporary HTML file that will run the screenshot service
const adminHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Screenshot Update Service</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-100 p-8">
  <div class="max-w-4xl mx-auto bg-white p-6 rounded-lg shadow-md">
    <h1 class="text-2xl font-bold mb-4">Screenshot Update Service</h1>
    <p class="mb-4">This page will automatically run the screenshot update service for all startups in the database.</p>
    <div id="results" class="bg-gray-50 p-4 rounded border border-gray-200 h-64 overflow-auto font-mono text-sm">
      <p>Starting screenshot update service...</p>
    </div>
  </div>

  <script type="module">
    import { updateAllScreenshots } from './src/lib/update-screenshots.js';

    const resultsDiv = document.getElementById('results');

    function log(message, isError = false) {
      const p = document.createElement('p');
      p.textContent = message;
      p.style.color = isError ? 'red' : 'black';
      resultsDiv.appendChild(p);
      console.log(message);
    }

    try {
      const results = await updateAllScreenshots();
      log('Screenshot update completed:');
      log(\`Total: \${results.total}\`);
      log(\`Success: \${results.success}\`);
      log(\`Failed: \${results.failed}\`);
      log('Details: ' + JSON.stringify(results.details, null, 2));
    } catch (error) {
      log(\`Error updating screenshots: \${error.message}\`, true);
      console.error('Error updating screenshots:', error);
    }
  </script>
</body>
</html>
`;

// Write the admin HTML file
const adminFilePath = path.join(__dirname, 'admin-screenshots.html');
fs.writeFileSync(adminFilePath, adminHtml);

console.log(`Created admin page at ${adminFilePath}`);
console.log('Opening the admin page in your browser...');

// Open the admin page in the default browser
try {
  // Determine the OS and use the appropriate command to open the browser
  const platform = process.platform;
  const fileUrl = `file://${adminFilePath}`;
  
  if (platform === 'darwin') { // macOS
    execSync(`open "${fileUrl}"`);
  } else if (platform === 'win32') { // Windows
    execSync(`start "" "${fileUrl}"`);
  } else { // Linux and others
    execSync(`xdg-open "${fileUrl}"`);
  }
  
  console.log('Browser opened successfully. Check the admin page to see the screenshot update progress.');
} catch (error) {
  console.error('Failed to open browser:', error);
  console.log(`Please manually open the file: ${adminFilePath}`);
}


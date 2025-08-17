/**
 * Script to apply the migration to add screenshot_url column to the startups table
 */

// Load environment variables
const fs = require('fs');
const path = require('path');
const https = require('https');

// Read environment variables from .env file
const envFile = fs.readFileSync(path.join(__dirname, '../.env'), 'utf8');
const envVars = {};
envFile.split('\n').forEach(line => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) {
    envVars[match[1]] = match[2];
  }
});

const SUPABASE_URL = envVars.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing required environment variables');
  process.exit(1);
}

// SQL to execute
const sql = `
-- Add screenshot_url column to startups table
ALTER TABLE public.startups ADD COLUMN IF NOT EXISTS screenshot_url TEXT;
`;

// Function to execute SQL using Supabase REST API
async function executeSql(sql) {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL);
    
    const options = {
      hostname: url.hostname,
      path: '/rest/v1/rpc/alter_table_add_column',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`Request failed with status code ${res.statusCode}: ${data}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    req.write(JSON.stringify({
      table_name: 'startups',
      column_name: 'screenshot_url',
      column_type: 'TEXT'
    }));
    req.end();
  });
}

// Create a custom function to add a column if it doesn't exist
async function createCustomFunction() {
  return new Promise((resolve, reject) => {
    const url = new URL(SUPABASE_URL);
    
    const options = {
      hostname: url.hostname,
      path: '/rest/v1/rpc/create_custom_function',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`
      }
    };
    
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(data);
        } else {
          reject(new Error(`Request failed with status code ${res.statusCode}: ${data}`));
        }
      });
    });
    
    req.on('error', (error) => {
      reject(error);
    });
    
    const createFunctionSql = `
    CREATE OR REPLACE FUNCTION alter_table_add_column(
      table_name text,
      column_name text,
      column_type text
    ) RETURNS void AS $$
    BEGIN
      EXECUTE format('ALTER TABLE %I ADD COLUMN IF NOT EXISTS %I %s', table_name, column_name, column_type);
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
    
    GRANT EXECUTE ON FUNCTION alter_table_add_column TO service_role;
    `;
    
    req.write(JSON.stringify({
      function_sql: createFunctionSql
    }));
    req.end();
  });
}

// Main function
async function main() {
  try {
    console.log('Creating custom function...');
    await createCustomFunction();
    console.log('Custom function created successfully');
    
    console.log('Executing SQL to add screenshot_url column...');
    await executeSql(sql);
    console.log('SQL executed successfully');
    
    console.log('Migration completed successfully');
  } catch (error) {
    console.error('Error applying migration:', error);
  }
}

// Run the script
main();

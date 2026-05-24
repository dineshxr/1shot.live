/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './*.html',
    './src/**/*.{html,js}',
    './blog/**/*.html',
  ],
  // Keep utilities that are constructed at runtime (rare, but safe).
  safelist: [
    'md:grid-cols-2',
    'md:grid-cols-3',
    'startup-card-1st',
    'startup-card-2nd',
    'startup-card-3rd',
    'startup-card-featured',
  ],
  theme: { extend: {} },
  plugins: [],
};

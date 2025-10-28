/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'avio': {
          // Aviation-inspired color palette
          'primary': '#475569',      // slate-600 - main action color
          'primary-hover': '#334155', // slate-700 - hover state
          'accent': '#64748b',       // slate-500 - focus rings, accents
          'panel': '#f1f5f9',        // slate-100 - panel backgrounds
          'text-label': '#64748b',   // slate-500 - label text
          'text-muted': '#94a3b8',   // slate-400 - muted text
        }
      }
    },
  },
  plugins: [],
}


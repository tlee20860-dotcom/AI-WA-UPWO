/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,html}"
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: '#6366F1',
          hover: '#4F46E5',
        },
        bg: '#F4F7FB',
        inset: '#F8FAFC',
      },
      boxShadow: {
        'soft': '0 4px 20px -2px rgba(0,0,0,0.05)',
        'inset-soft': 'inset 0 2px 4px 0 rgba(0,0,0,0.02)',
      },
      borderRadius: {
        '2xl': '20px',
      }
    }
  },
  plugins: [],
}

/* ═══ EOF ═══
F: tailwind.config.js
V: 1792903500
W: webapp-20261026-001#11
═══ */
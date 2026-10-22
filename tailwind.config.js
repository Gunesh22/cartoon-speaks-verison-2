/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        editor: {
          bg: '#141416',
          panel: '#1e1f24',
          subpanel: '#282a30',
          border: '#353840',
          hover: '#3a3e47',
          accent: '#3b82f6',
          accentHover: '#2563eb',
          text: '#f3f4f6',
          muted: '#9ca3af',
        }
      }
    },
  },
  plugins: [],
}

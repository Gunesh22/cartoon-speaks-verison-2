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
          bg: '#111216',
          panel: '#191A20',
          subpanel: '#202129',
          elevated: '#202129',
          surface: '#15161B',
          border: '#30313B',
          borderSubtle: '#262732',
          borderFocus: '#8B5CF6',
          hover: '#252631',
          active: '#2E303E',
          accent: '#8B5CF6',
          accentHover: '#A78BFA',
          accentAction: '#7C3AED',
          accentMuted: '#6D28D9',
          success: '#10B981',
          successHover: '#059669',
          warning: '#F59E0B',
          danger: '#EF4444',
          dangerHover: '#DC2626',
          text: '#F3F4F6',
          secondary: '#9CA3AF',
          muted: '#6B7280',
        }
      },
      borderRadius: {
        'editor-sm': '6px',
        'editor-md': '8px',
        'editor-lg': '10px',
        'editor-xl': '12px',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI"',
          'Roboto',
          'Helvetica',
          'Arial',
          'sans-serif',
        ],
      },
      boxShadow: {
        'panel': '0 4px 20px -2px rgba(0, 0, 0, 0.45)',
        'modal': '0 20px 40px -8px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.05)',
        'glow-accent': '0 0 16px -2px rgba(139, 92, 246, 0.35)',
      }
    },
  },
  plugins: [],
}

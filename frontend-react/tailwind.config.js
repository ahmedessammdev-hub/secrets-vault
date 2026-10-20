/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        canvas: {
          950: 'var(--bg-base)',
          900: 'var(--bg-surface)',
          850: 'var(--bg-card)',
          800: 'var(--bg-hover)',
          DEFAULT: 'var(--bg-base)',
        },
        border: {
          DEFAULT: 'var(--border-main)',
          subtle: 'var(--border-subtle)',
        },
        text: {
          primary: 'var(--text-main)',
          secondary: 'var(--text-sub)',
          muted: 'var(--text-muted)',
        },
        brand: {
          50: '#f0f9ff',
          100: '#e0f2fe',
          200: '#bae6fd',
          300: '#7dd3fc',
          400: '#38bdf8',
          500: '#0ea5e9',
          600: '#0284c7',
          700: '#0369a1',
          800: '#075985',
          900: '#0c4a6e',
        }
      },
      fontFamily: {
        sans: ['Cairo', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
      boxShadow: {
        'subtle': '0 1px 2px 0 rgba(0, 0, 0, 0.25)',
        'elevated': '0 8px 32px -4px rgba(0, 0, 0, 0.5)',
      }
    },
  },
  plugins: [
    require('@tailwindcss/forms'),
  ],
}

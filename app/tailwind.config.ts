import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#FFFFFF',
        text: '#000000',
        muted: '#6B6B6B',
        border: '#EAEAEA',
        hover: '#F5F5F5',
        active: '#EFEFEF',
      },
      fontFamily: {
        sans: ['Inter', 'SF Pro Display', 'Geist', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        panel: '0 20px 60px rgba(0, 0, 0, 0.04)',
      },
    },
  },
  plugins: [],
} satisfies Config


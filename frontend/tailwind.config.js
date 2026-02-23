/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'Consolas', 'monospace'],
      },
      colors: {
        surface: 'rgba(255,255,255,0.03)',
        border: 'rgba(255,255,255,0.07)',
      },
      keyframes: {
        pulse_glow: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
        fadeIn: {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        pulse_glow: 'pulse_glow 2s ease-in-out infinite',
        fadeIn: 'fadeIn 0.4s ease forwards',
      },
    },
  },
  plugins: [],
}

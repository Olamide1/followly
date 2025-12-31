/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{vue,js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Agnes Martin inspired palette - minimal, muted, warm
        canvas: '#FBFBF9', // warm off-white, very subtle
        paper: '#FFFFFF', // pure white for contrast
        grid: {
          light: '#F0F0EE', // very subtle grid lines
          medium: '#E5E5E3', // medium grid lines
          dark: '#D8D8D6', // darker grid lines
        },
        ink: {
          50: '#F8F8F6',
          100: '#EDEDEB',
          200: '#DADAD8',
          300: '#C5C5C3',
          400: '#A8A8A6',
          500: '#8A8A88',
          600: '#6E6E6C',
          700: '#525250',
          800: '#3A3A38',
          900: '#242422', // soft black, not pure
        },
        accent: {
          // Very subtle blue - almost grey
          light: '#E8EBED',
          soft: '#D1D6DA',
          medium: '#9CA8B0',
          base: '#6B7A85', // muted blue-grey
          dark: '#4A5560',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        'grid': '0.5px', // Agnes Martin grid line width
      },
      letterSpacing: {
        'wide': '0.05em',
        'wider': '0.1em',
      },
      borderWidth: {
        'grid': '0.5px',
      },
    },
  },
  plugins: [],
}


/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Cream — warm off-white base palette
        cream: {
          50: '#FFFDF9',
          100: '#FDF8F0',
          200: '#FBF0E1',
          300: '#F6E6CF',
          400: '#EFD8B8',
          500: '#E6C79B',
          600: '#D4AF7A',
          700: '#B8925C',
          800: '#8F6F42',
          900: '#6B532F',
        },
        // Orange — vibrant primary brand accent
        orange: {
          50: '#FFF5ED',
          100: '#FFE8D4',
          200: '#FFCEA8',
          300: '#FFAC70',
          400: '#FF8A3D',
          500: '#FF6B1A',
          600: '#F04E00',
          700: '#C73C05',
          800: '#9E310C',
          900: '#7F2B0E',
        },
        // Ember — deep warm accent for contrast text/CTAs
        ember: {
          50: '#FDF4F0',
          100: '#FAE5DA',
          200: '#F3C4AE',
          300: '#E89B78',
          400: '#DB6E44',
          500: '#C74E24',
          600: '#A63A18',
          700: '#822C14',
          800: '#5F2110',
          900: '#3D160B',
        },
        // Keep primary/accent mapped to orange family for legacy classes
        primary: {
          50: '#FFF5ED',
          100: '#FFE8D4',
          200: '#FFCEA8',
          300: '#FFAC70',
          400: '#FF8A3D',
          500: '#FF6B1A',
          600: '#F04E00',
          700: '#C73C05',
          800: '#9E310C',
          900: '#7F2B0E',
        },
        accent: {
          50: '#FDF4F0',
          100: '#FAE5DA',
          200: '#F3C4AE',
          300: '#E89B78',
          400: '#DB6E44',
          500: '#C74E24',
          600: '#A63A18',
          700: '#822C14',
          800: '#5F2110',
          900: '#3D160B',
        },
        success: {
          50: '#ECFDF5', 100: '#D1FAE5', 200: '#A7F3D0', 300: '#6EE7B7',
          400: '#34D399', 500: '#10B981', 600: '#059669', 700: '#047857',
          800: '#065F46', 900: '#064E3B',
        },
        warning: {
          50: '#FFF7ED', 100: '#FFEDD5', 200: '#FED7AA', 300: '#FDBA74',
          400: '#FB923C', 500: '#F97316', 600: '#EA580C', 700: '#C2410C',
          800: '#9A3412', 900: '#7C2D12',
        },
        danger: {
          50: '#FEF2F2', 100: '#FEE2E2', 200: '#FECACA', 300: '#FCA5A5',
          400: '#F87171', 500: '#EF4444', 600: '#DC2626', 700: '#B91C1C',
          800: '#991B1B', 900: '#7F1D1D',
        },
        ink: {
          DEFAULT: '#2A211A',
          soft: '#4A3D31',
          muted: '#7A6A58',
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', '"Inter"', 'system-ui', 'sans-serif'],
        body: ['"Inter"', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      boxShadow: {
        'card': '0 1px 3px 0 rgba(120, 80, 40, 0.08), 0 1px 2px 0 rgba(120, 80, 40, 0.04)',
        'card-hover': '0 12px 28px -6px rgba(160, 90, 30, 0.18), 0 6px 12px -6px rgba(160, 90, 30, 0.1)',
        'button': '0 1px 2px 0 rgba(160, 60, 0, 0.12)',
        'button-hover': '0 6px 16px -3px rgba(240, 78, 0, 0.35)',
        'glow': '0 0 32px rgba(255, 107, 26, 0.35)',
        'glow-lg': '0 8px 40px -4px rgba(255, 107, 26, 0.45)',
        'soft': '0 20px 60px -20px rgba(120, 70, 30, 0.25)',
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-orange': 'linear-gradient(135deg, #FF8A3D 0%, #F04E00 100%)',
        'gradient-ember': 'linear-gradient(135deg, #FF6B1A 0%, #C74E24 100%)',
        'gradient-warm': 'linear-gradient(135deg, #FDF8F0 0%, #FBF0E1 50%, #FFE8D4 100%)',
        'gradient-sunset': 'linear-gradient(120deg, #FF6B1A 0%, #FF8A3D 40%, #FFAC70 100%)',
      },
      animation: {
        'fade-in': 'fadeIn 0.5s ease-in-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-up-delay': 'slideUp 0.7s ease-out',
        'float': 'float 6s ease-in-out infinite',
        'float-slow': 'float 9s ease-in-out infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'blob': 'blob 12s ease-in-out infinite',
        'shimmer': 'shimmer 2.5s linear infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { transform: 'translateY(24px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-18px)' },
        },
        blob: {
          '0%, 100%': { transform: 'translate(0, 0) scale(1)' },
          '33%': { transform: 'translate(30px, -30px) scale(1.1)' },
          '66%': { transform: 'translate(-20px, 20px) scale(0.95)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
    },
  },
  plugins: [],
};

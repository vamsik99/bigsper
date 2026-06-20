/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:      'var(--bg)',
        surface: 'var(--surface)',
        ink:     'var(--ink)',
        muted:   'var(--muted)',
        'accent-blue':  'var(--accent-blue)',
        'accent-coral': 'var(--accent-coral)',
        'accent-lime':  'var(--accent-lime)',
        'accent-ink':   'var(--accent-ink)',
        'badge-verified':    'var(--badge-verified)',
        'badge-ai-assessed': 'var(--badge-ai-assessed)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      boxShadow: {
        card: '0 1px 4px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.03)',
      },
    },
  },
  plugins: [],
}

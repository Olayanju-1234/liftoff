/** @type {import('tailwindcss').Config} */
const channel = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: { DEFAULT: channel('paper'), deep: channel('paper-deep') },
        card: channel('card'),
        rule: { DEFAULT: channel('rule'), strong: channel('rule-strong') },
        ink: {
          DEFAULT: channel('ink'),
          2: channel('ink-2'),
          3: channel('ink-3'),
          4: channel('ink-4'),
        },
        blueprint: channel('blueprint'),
        ignite: channel('ignite'),
        go: channel('go'),
        abort: channel('abort'),
        hold: channel('hold'),
        scrub: channel('scrub'),
      },
      fontFamily: {
        sans: ['Barlow', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        cond: ['"Barlow Condensed"', 'Barlow', 'ui-sans-serif', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        mark: ['Michroma', '"Barlow Condensed"', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '3px',
        sm: '2px',
        md: '4px',
      },
      boxShadow: {
        sheet: '0 1px 0 rgb(var(--ink) / 0.04), 0 10px 24px -18px rgb(var(--ink) / 0.35)',
        lift: '0 1px 0 rgb(var(--ink) / 0.05), 0 24px 48px -24px rgb(var(--ink) / 0.45)',
      },
    },
  },
  plugins: [],
};

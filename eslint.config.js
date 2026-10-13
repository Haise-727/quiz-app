import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'

export default [
  { ignores: ['dist'] },
  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      // `motion` is used as <motion.div>, which this config cannot see as a use. Without
      // the exception every file that animates reported a false "unused variable".
      // The same goes for a component held in a variable or a parameter, such as
      // items.map(({ icon: Icon }) => <Icon />): the JSX use is invisible to this config.
      'no-unused-vars': ['error', { varsIgnorePattern: '^(motion$|[A-Z_])', argsIgnorePattern: '^[A-Z_]' }],
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  {
    // The database and sign in SDK may only be imported inside src/api (and src/firebase.js, which
    // sets it up). Everything else asks src/api for what it needs, so the backend can change
    // without touching a page. See src/api/README.md.
    files: ['src/**/*.{js,jsx}'],
    ignores: ['src/api/**', 'src/firebase.js'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          { group: ['firebase', 'firebase/*'], message: 'Use src/api instead of importing Firebase directly.' },
          { group: ['@/firebase', '**/firebase'], message: 'Use src/api instead of importing the Firebase setup directly.' },
        ],
      }],
    },
  },
  {
    // Node scripts and config run in Node, not the browser.
    files: ['api/**/*.js', 'scripts/**/*.{js,mjs}', 'vite.config.js', 'eslint.config.js'],
    languageOptions: { globals: globals.node },
  },
]

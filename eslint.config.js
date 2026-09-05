import js from '@eslint/js'
import globals from 'globals'
import react from 'eslint-plugin-react'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import jsxA11y from 'eslint-plugin-jsx-a11y'

export default [
  { ignores: ['dist', 'node_modules', 'design'] },

  {
    files: ['**/*.{js,jsx}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { ...globals.browser },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      // Avoids the "React version not specified" warning; the plugin reads the
      // installed react rather than us pinning a number here.
      react: { version: 'detect' },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      'jsx-a11y': jsxA11y,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.flat.recommended.rules,
      ...react.configs.flat['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      ...jsxA11y.flatConfigs.recommended.rules,

      // The whole point of adding this: dependency arrays in Review.jsx and
      // AppContext.jsx are hand-maintained and stale deps are silent bugs.
      'react-hooks/exhaustive-deps': 'error',

      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // Props are documented by the components themselves; prop-types would be
      // noise in a codebase this size.
      'react/prop-types': 'off',

      // Deliberate discards, e.g. `const { [id]: _dropped, ...rest } = obj`.
      'no-unused-vars': ['error', { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }],
    },
  },

  // Test files run under Vitest, not in a browser.
  {
    files: ['**/*.test.{js,jsx}'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Config files are Node modules.
  {
    files: ['*.config.js', 'eslint.config.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },
]

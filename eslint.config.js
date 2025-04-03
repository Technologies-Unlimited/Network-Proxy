import js from '@eslint/js'
import tseslint from '@typescript-eslint/eslint-plugin'
import tseslintParser from '@typescript-eslint/parser'
import reactPlugin from 'eslint-plugin-react'
import reactHooksPlugin from 'eslint-plugin-react-hooks'
import prettierPlugin from 'eslint-plugin-prettier'
import nextPlugin from '@next/eslint-plugin-next'
import _globals from 'globals'
import { fileURLToPath } from 'url'
import { dirname } from 'path'

// Get the equivalent of __dirname in ES modules
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Converts a config into a rules object.
 * Returns {} if config is undefined, is an array, or lacks `.rules`.
 */
function toRulesObject(config) {
  if (!config) return {}
  if (Array.isArray(config)) {
    return {}
  }
  if (!config.rules || typeof config.rules !== 'object') {
    return {}
  }
  return config.rules
}

// Combine globals from the 'globals' package:
const combinedGlobals = {
  ..._globals.browser,
  ..._globals.es2021,
  ..._globals.node,
}

// Sanitize any keys that may have trailing/leading whitespace:
for (const key of Object.keys(combinedGlobals)) {
  const trimmedKey = key.trim()
  if (trimmedKey !== key) {
    combinedGlobals[trimmedKey] = combinedGlobals[key]
    delete combinedGlobals[key]
  }
}

export default [
  // 1) Merged plugin "recommended" rules (flat config doesn't use "extends")
  {
    rules: {
      ...toRulesObject(js.configs.recommended),
      ...toRulesObject(tseslint.configs.recommended),
      ...toRulesObject(tseslint.configs['recommended-requiring-type-checking']),
      ...toRulesObject(reactPlugin.configs.recommended),
      ...toRulesObject(reactHooksPlugin.configs.recommended),
      ...toRulesObject(nextPlugin.configs.recommended),
      ...toRulesObject(prettierPlugin.configs.recommended),
    },
  },

  // 2) Config that applies to JS/TS files, with parser & custom rules
  {
    files: ['**/*.{js,mjs,cjs,jsx,ts,tsx}'],

    plugins: {
      '@typescript-eslint': tseslint,
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
      prettier: prettierPlugin,
      '@next/next': nextPlugin,
    },

    languageOptions: {
      parser: tseslintParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',

        // Type-aware linting - updated to include Storybook tsconfig
        project: ['./tsconfig.json', './.storybook/tsconfig.json'],
        tsconfigRootDir: __dirname,

        // Let TS check JSDoc in .js files
        allowJs: true,
        checkJs: true,
      },
      globals: combinedGlobals,
    },

    settings: {
      react: {
        version: 'detect',
      },
    },

    rules: {
      // Turn off base rule & enable TypeScript-specific version
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': 'error',

      // Misc warnings
      'no-undef': 'warn',
      'no-empty': 'warn',
      'no-case-declarations': 'warn',
      'react/display-name': 'warn',
      'no-useless-catch': 'warn',
      'react/no-unescaped-entities': 'warn',

      // React Hooks
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',

      // Prettier
      'prettier/prettier': 'warn',

      // TS-specific overrides
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',

      // Turn off the 'no-floating-promises' rule:
      '@typescript-eslint/no-floating-promises': 'off',

      // React-specific overrides
      'react/prop-types': 'off',
      'react/react-in-jsx-scope': 'off',

      // Certain rules as errors
      'no-unreachable': 'error',
      'no-unreachable-loop': 'error',
      'no-fallthrough': 'error',
    },
  },
]

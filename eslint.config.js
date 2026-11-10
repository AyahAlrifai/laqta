import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/out/**',
      '**/dist/**',
      '**/coverage/**',
      'doc/**',
      '**/test-results/**',
      'gateway/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      globals: { ...globals.node },
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            'eslint.config.js',
            'tools/*.js',
            'tools/*.cjs',
            'tools/fixtures/*.cjs',
            'tools/icon/*.cjs',
          ],
        },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Spec section 0, rule 7: no default exports except React components (*.tsx).
      'no-restricted-syntax': [
        'error',
        { selector: 'ExportDefaultDeclaration', message: 'Use named exports.' },
      ],
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      // Spec section 0, rule 7: `any` only with a justifying comment next to an eslint-disable.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-confusing-void-expression': ['error', { ignoreArrowShorthand: true }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
    },
  },
  {
    // Tooling config files must default-export by convention of those tools.
    files: ['**/*.config.{js,ts,mts}', '**/*.tsx', '**/*.d.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['app/src/renderer/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      // CSS module class lookups are typed `string | undefined` under noUncheckedIndexedAccess.
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true, allowNullish: true },
      ],
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Spec section 0: never innerHTML with untrusted text.
      'no-restricted-properties': [
        'error',
        { property: 'innerHTML', message: 'Never use innerHTML.' },
        { property: 'outerHTML', message: 'Never use outerHTML.' },
      ],
      'no-restricted-syntax': [
        'error',
        { selector: 'ExportDefaultDeclaration', message: 'Use named exports.' },
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Never use dangerouslySetInnerHTML.',
        },
      ],
    },
  },
  {
    // React components may default-export (spec section 0, rule 7).
    files: ['app/src/renderer/**/*.tsx'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']",
          message: 'Never use dangerouslySetInnerHTML.',
        },
      ],
    },
  },
  {
    files: ['**/*.js', '**/*.cjs'],
    extends: [tseslint.configs.disableTypeChecked],
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs', globals: { ...globals.node } },
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  prettier,
);

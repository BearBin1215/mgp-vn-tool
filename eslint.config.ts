import { defineConfig, globalIgnores } from 'eslint/config';
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import stylistic from '@stylistic/eslint-plugin';
import eslintReact from '@eslint-react/eslint-plugin';
import { importX } from 'eslint-plugin-import-x';

export default defineConfig(
  globalIgnores([
    '**/node_modules/',
  ]),

  eslint.configs.recommended,
  tseslint.configs.recommended,
  eslintReact.configs['recommended-typescript'],

  {
    files: ['src/**/*.ts', 'src/**/*.tsx', 'src/**/*.jsx'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@stylistic': stylistic,
      '@react': eslintReact,
      'import-x': importX,
    },
    rules: {
      'curly': 2,
      'dot-notation': 2,
      'eqeqeq': 2,
      'logical-assignment-operators': 2,
      'no-new-func': 2,
      'no-new-wrappers': 2,
      'no-object-constructor': 2,
      'no-var': 2,
      'no-misleading-character-class': 2,
      'no-template-curly-in-string': 2,
      'no-console': 0,
      'no-unused-vars': 0,
      'no-redeclare': 1,
      'no-unreachable': 1,
      'no-inner-declarations': 0,
      'no-unneeded-ternary': 2,
      'no-else-return': 2,
      'no-empty': [2, { allowEmptyCatch: true }],
      'no-extra-bind': 2,
      'no-labels': 2,
      'no-lone-blocks': 2,
      'no-loop-func': 2,
      'no-magic-numbers': 0,
      'no-param-reassign': 2,
      '@typescript-eslint/no-shadow': 2,
      'no-nested-ternary': 2,
      'no-unused-expressions': 2,
      'no-useless-rename': 2,
      'no-useless-return': 2,
      'no-use-before-define': 2,
      'object-shorthand': 2,
      'one-var': [2, 'never'],
      'prefer-const': 2,
      'prefer-arrow-callback': 2,
      'prefer-spread': 2,
      'prefer-template': 2,
      'prefer-rest-params': 2,
      'prefer-exponentiation-operator': 2,
      'prefer-destructuring': 0,
      'require-await': 2,
      'yoda': 2,

      '@typescript-eslint/ban-ts-comment': 0,
      '@typescript-eslint/no-explicit-any': 0,
      '@typescript-eslint/no-unused-vars': [2, {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true,
      }],

      '@eslint-react/dom-no-dangerously-set-innerhtml': 0,
      '@eslint-react/exhaustive-deps': 0,
      '@eslint-react/no-class-component': 2,
      '@eslint-react/no-forward-ref': 2,
      '@eslint-react/jsx-no-useless-fragment': 1,

      '@stylistic/jsx-closing-bracket-location': 2,
      '@stylistic/jsx-curly-brace-presence': 2,
      '@stylistic/jsx-equals-spacing': 2,
      '@stylistic/jsx-first-prop-new-line': [2, 'multiline'],
      '@stylistic/jsx-indent-props': [2, 2],
      '@stylistic/jsx-max-props-per-line': [2, { maximum: { single: 2, multi: 1 } }],
      '@stylistic/jsx-quotes': [1, 'prefer-single'],
      '@stylistic/jsx-self-closing-comp': 2,
      '@stylistic/jsx-tag-spacing': 2,
      '@stylistic/jsx-wrap-multilines': [2, {
        declaration: 'parens-new-line',
        assignment: 'parens-new-line',
        return: 'parens-new-line',
        condition: 'parens-new-line',
        arrow: 'parens-new-line',
        logical: 'parens-new-line',
      }],
      // '@stylistic/jsx-shorthand-boolean': 2,

      '@stylistic/arrow-parens': 2,
      '@stylistic/arrow-spacing': [2, { before: true, after: true }],
      '@stylistic/comma-dangle': [1, 'always-multiline'],
      '@stylistic/indent': [2, 2],
      '@stylistic/linebreak-style': 0,
      '@stylistic/no-floating-decimal': 2,
      '@stylistic/no-multi-spaces': 2,
      '@stylistic/no-trailing-spaces': 2,
      '@stylistic/quotes': [1, 'single', { avoidEscape: true }],
      '@stylistic/quote-props': [1, 'as-needed', { unnecessary: true, numbers: false }],
      '@stylistic/semi': [2, 'always'],
      '@stylistic/spaced-comment': 2,

      // import 插件很多用于检查导入导出是否有效的，本仓库有 TS 检查，
      // 因此这个插件只用于检查格式、弃用依赖等
      'import-x/order': [2, {
        groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
        pathGroups: [{ pattern: '@/**', group: 'internal' }],
        pathGroupsExcludedImportTypes: ['builtin'],
      }],
      'import-x/no-deprecated': 2,
      'import-x/no-duplicates': [2, { 'prefer-inline': true }],
      'import-x/newline-after-import': [2, { considerComments: true }],
    },
  },
);

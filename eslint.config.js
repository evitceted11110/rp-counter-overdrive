import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['**/node_modules/**', '**/dist/**', '**/coverage/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.js'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: '禁止 Math.random()；請使用 @rogue-paradise/rng。',
        },
      ],
      'no-restricted-globals': [
        'error',
        ...['localStorage', 'sessionStorage', 'indexedDB'].map((name) => ({
          name,
          message: `禁止直接使用 ${name}；請使用 platform-sdk Storage API。`,
        })),
      ],
    },
  },
  {
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@rogue-paradise/platform-sdk',
              message: 'core 不得依賴瀏覽器平台契約。',
            },
            { name: 'vite', message: 'core 不得依賴建置或渲染層。' },
          ],
          patterns: [
            {
              group: ['**/render/**', '**/visual/**', 'pixi.js'],
              message: 'core 不得依賴 render、visual 或渲染函式庫。',
            },
          ],
        },
      ],
    },
  },
)

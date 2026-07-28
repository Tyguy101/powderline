import eslint from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'tools/reports', 'node_modules', 'app', 'build', 'db', 'drizzle', 'examples', 'worker', 'tests'] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['tools/**/*.ts', 'vite.config.ts'],
    languageOptions: { globals: globals.node },
  },
);

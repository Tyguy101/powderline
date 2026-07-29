import basicSsl from '@vitejs/plugin-basic-ssl';
import { execFileSync } from 'node:child_process';
import { defineConfig } from 'vitest/config';

function localBuildId(): string {
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 8);
  }
  try {
    return execFileSync('git', ['rev-parse', '--short=8', 'HEAD'], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return 'development';
  }
}

export default defineConfig(({ mode }) => ({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: mode === 'https' ? [basicSsl()] : [],
  define: {
    __POWDERLINE_BUILD_ID__: JSON.stringify(localBuildId()),
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    https: mode === 'https' ? {} : undefined,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
  },
  build: { target: 'esnext', outDir: 'dist' },
}));

import basicSsl from '@vitejs/plugin-basic-ssl';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
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

export default defineConfig(({ mode }) => {
  const certificatePath = path.resolve('.cert/powderline-local.pem');
  const keyPath = path.resolve('.cert/powderline-local-key.pem');
  const trustedLocalCertificate = mode === 'https' && existsSync(certificatePath) && existsSync(keyPath)
    ? { cert: readFileSync(certificatePath), key: readFileSync(keyPath) }
    : undefined;
  return ({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: mode === 'https' && !trustedLocalCertificate ? [basicSsl()] : [],
  define: {
    __POWDERLINE_BUILD_ID__: JSON.stringify(localBuildId()),
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    https: mode === 'https' ? trustedLocalCertificate ?? {} : undefined,
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    strictPort: true,
  },
  build: { target: 'esnext', outDir: 'dist' },
  });
});

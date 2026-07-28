import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const serverDirectory = path.resolve('dist/server');
await mkdir(serverDirectory, { recursive: true });
await writeFile(
  path.join(serverDirectory, 'index.js'),
  `export default {
  async fetch(request, env) {
    if (env.ASSETS && typeof env.ASSETS.fetch === 'function') {
      return env.ASSETS.fetch(request);
    }
    return new Response('Powderline static asset binding is unavailable.', { status: 503 });
  },
};
`,
);

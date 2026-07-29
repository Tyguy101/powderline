import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const workerOutput = path.resolve('dist/powderline');
const serverOutput = path.resolve('dist/server');
await mkdir(serverOutput, { recursive: true });
await copyFile(path.join(workerOutput, 'index.js'), path.join(serverOutput, 'index.js'));

const generatedConfig = JSON.parse(
  await readFile(path.join(workerOutput, 'wrangler.json'), 'utf8'),
) as {
  main: string;
  legacy_env?: boolean;
  assets?: { directory?: string };
};
generatedConfig.main = 'server/index.js';
delete generatedConfig.legacy_env;
if (generatedConfig.assets) generatedConfig.assets.directory = 'client';
await writeFile(path.resolve('dist/wrangler.json'), JSON.stringify(generatedConfig, null, 2));

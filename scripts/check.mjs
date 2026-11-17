import { spawnSync } from 'node:child_process';

for (const file of ['public/app.js', 'public/lib.js', 'public/listening.js', 'public/listening-lib.js', 'scripts/serve.mjs', 'scripts/build.mjs']) {
  const result = spawnSync(process.execPath, ['--check', file], { stdio: 'inherit' });
  if (result.status !== 0) process.exit(result.status || 1);
}
console.log('JavaScript syntax checks passed.');

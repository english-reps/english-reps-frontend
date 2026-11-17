import test from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { buildSite } from '../scripts/build.mjs';

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'english-reps-assets-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const source = join(directory, 'public');
  await cp(new URL('../public/', import.meta.url), source, { recursive: true });
  return { source, output: join(directory, 'dist') };
}

test('production HTML and every module dependency use existing content-hashed assets', async t => {
  const options = await fixture(t);
  const result = await buildSite(options);
  const html = await readFile(join(options.output, 'index.html'), 'utf8');
  assert.match(result.entry, /^app\.[a-f\d]{12}\.js$/);
  assert.ok(html.includes(`src="/${result.entry}"`));
  assert.ok(html.includes(`href="/${result.css}"`));
  for (const name of Object.values(result.modules)) {
    const path = join(options.output, name);
    const script = await readFile(path, 'utf8');
    for (const match of script.matchAll(/from\s+['"](\.\/[^'"]+\.js)['"]/g)) {
      assert.match(match[1], /\.[a-f\d]{12}\.js$/);
      assert.ok((await stat(resolve(dirname(path), match[1]))).isFile());
    }
    assert.ok(!script.includes("'/data/listening.json'"));
    assert.ok(!script.includes("'/data/vocabulary.json'"));
  }
  for (const path of Object.values(result.data)) assert.ok((await stat(join(options.output, path.slice(1)))).isFile());
});

test('changing a nested listening dependency changes the entry URL even without editing app.js', async t => {
  const options = await fixture(t);
  const first = await buildSite(options);
  const module = join(options.source, 'listening-lib.js');
  await writeFile(module, await readFile(module, 'utf8') + '\n// New listening implementation.\n');
  const next = await buildSite(options);
  assert.notEqual(next.entry, first.entry);
  assert.notEqual(next.modules['listening.js'], first.modules['listening.js']);
  assert.equal(next.modules['lib.js'], first.modules['lib.js']);
  assert.equal(next.css, first.css);
});

test('a question-bank update changes both its fetch URL and the entry graph', async t => {
  const options = await fixture(t);
  const first = await buildSite(options);
  const path = join(options.source, 'data', 'listening.json');
  const data = JSON.parse(await readFile(path, 'utf8'));
  data.source.description += ' Updated.';
  await writeFile(path, JSON.stringify(data));
  const next = await buildSite(options);
  assert.notEqual(next.data['/data/listening.json'], first.data['/data/listening.json']);
  assert.notEqual(next.entry, first.entry);
  assert.equal(next.data['/data/vocabulary.json'], first.data['/data/vocabulary.json']);
});

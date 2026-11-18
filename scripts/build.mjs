import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const publicDirectory = fileURLToPath(new URL('../public/', import.meta.url));
const outputDirectory = fileURLToPath(new URL('../dist/', import.meta.url));
const hash = text => createHash('sha256').update(text).digest('hex').slice(0, 12);
const imports = /(\b(?:from|import)\s*['"])(\.\/?[^'"]+\.js)(['"])/g;

// Fingerprint the whole module graph, so changing a dependency also changes the
// entry URL. A refreshed HTML document cannot silently reuse an older app.js.
export async function buildSite({ source = publicDirectory, output = outputDirectory } = {}) {
  source = resolve(source);
  output = resolve(output);
  if (source === output || source.startsWith(output + sep) || output.startsWith(source + sep)) throw new Error('Source and output must be separate directories');
  const stage = await mkdtemp(join(tmpdir(), 'english-reps-build-'));
  const modules = new Map();
  const visiting = new Set();
  const dataAssets = new Map();
  try {
    await cp(source, stage, { recursive: true });
    for (const name of await readdir(join(source, 'data'))) {
      if (!name.endsWith('.json')) continue;
      const text = await readFile(join(source, 'data', name), 'utf8');
      const fingerprinted = name.replace(/\.json$/, `.${hash(text)}.json`);
      await writeFile(join(stage, 'data', fingerprinted), text);
      dataAssets.set(`/data/${name}`, `/data/${fingerprinted}`);
    }
    async function compile(name) {
      if (modules.has(name)) return modules.get(name);
      if (visiting.has(name)) throw new Error(`Circular module import: ${name}`);
      const path = resolve(source, name);
      if (!path.startsWith(source + sep)) throw new Error(`Module outside source: ${name}`);
      visiting.add(name);
      let text = await readFile(path, 'utf8');
      const dependencies = new Map();
      for (const match of text.matchAll(imports)) {
        const dependency = relative(source, resolve(dirname(path), match[2]));
        dependencies.set(match[2], await compile(dependency));
      }
      text = text.replace(imports, (match, prefix, dependency, quote) => {
        const next = relative(dirname(name), dependencies.get(dependency)).split(sep).join('/');
        return `${prefix}${next.startsWith('.') ? next : './' + next}${quote}`;
      });
      for (const [original, fingerprinted] of dataAssets) text = text.replaceAll(original, fingerprinted);
      const fingerprinted = name.replace(/\.js$/, `.${hash(text)}.js`);
      await mkdir(dirname(join(stage, fingerprinted)), { recursive: true });
      await writeFile(join(stage, fingerprinted), text);
      visiting.delete(name);
      modules.set(name, fingerprinted);
      return fingerprinted;
    }
    const entry = await compile('app.js');
    for (const name of modules.keys()) await rm(join(stage, name));
    const css = await readFile(join(source, 'styles.css'), 'utf8');
    const cssName = `styles.${hash(css)}.css`;
    await writeFile(join(stage, cssName), css);
    await rm(join(stage, 'styles.css'));
    let html = await readFile(join(source, 'index.html'), 'utf8');
    if (!html.includes('src="/app.js"') || !html.includes('href="/styles.css"')) throw new Error('Missing entry asset references');
    html = html.replace('src="/app.js"', `src="/${entry.split(sep).join('/')}"`).replace('href="/styles.css"', `href="/${cssName}"`);
    await writeFile(join(stage, 'index.html'), html);
    await mkdir(dirname(output), { recursive: true });
    await rm(output, { recursive: true, force: true });
    await cp(stage, output, { recursive: true });
    return { output, entry, css: cssName, modules: Object.fromEntries(modules), data: Object.fromEntries(dataAssets) };
  } finally {
    await rm(stage, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await buildSite();
  console.log(`Built ${result.output}: ${result.entry}`);
}

import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
const result = await build({ entryPoints: ['src/widget.mjs'], bundle: true, write: false, format: 'iife', target: 'es2022', minify: true });
const html = await readFile('src/widget.html', 'utf8');
const css = await readFile('src/widget.css', 'utf8');
await mkdir('dist', { recursive: true });
await writeFile('dist/dashboard.html', html.replace('/* WIDGET_CSS */', css).replace('/* WIDGET_JS */', () => result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script')));
const skillRoot = '../../plugins/macrosheet/skills/macrosheet/';
const readGuide = file => readFile(skillRoot + file, 'utf8');
const manifest = JSON.parse(await readFile('../../plugins/macrosheet/plugin.json', 'utf8'));
await writeFile('dist/tracking-guides.json', JSON.stringify({
  version: manifest.version,
  tracking: `${await readGuide('SKILL.md')}\n\n${await readGuide('references/tracker-template.md')}`,
  operations: await readGuide('references/operations.md'),
  presentation: await readGuide('references/presentation.md'),
  target_help: await readGuide('references/target-help.md'),
  recipes: await readGuide('references/recipes.md'),
  connection_help: await readGuide('references/connection-help.md'),
  template: await readGuide('assets/tracker-template.json')
}));

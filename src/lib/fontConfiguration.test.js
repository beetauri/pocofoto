import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('app font configuration uses Nunito everywhere', () => {
  const css = readFileSync('src/index.css', 'utf8');
  const html = readFileSync('index.html', 'utf8');
  const manifest = readFileSync('public/retune.manifest.json', 'utf8');
  const packageJson = readFileSync('package.json', 'utf8');

  assert.match(html, /fonts\.googleapis\.com/);
  assert.match(html, /fonts\.gstatic\.com/);
  assert.match(html, /family=Nunito/);
  assert.match(css, /--font-sans:\s*'Nunito', sans-serif;/);
  assert.match(css, /--font:\s*'Nunito', ui-rounded,/);
  assert.match(manifest, /'Nunito'/);

  assert.doesNotMatch(css, /Inter|Geist|@fontsource/);
  assert.doesNotMatch(html, /Inter|Geist/);
  assert.doesNotMatch(manifest, /Inter|Geist/);
  assert.doesNotMatch(packageJson, /@fontsource-variable\/nunito/);
  assert.doesNotMatch(packageJson, /@fontsource-variable\/geist/);
});

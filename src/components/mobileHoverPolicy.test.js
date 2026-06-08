import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const stylesheetSource = readFileSync(new URL('../index.css', import.meta.url), 'utf8');
const appButtonSource = readFileSync(new URL('./ui/button.jsx', import.meta.url), 'utf8');
const authScreenSource = readFileSync(new URL('./AuthScreen.jsx', import.meta.url), 'utf8');

function stripDesktopHoverMedia(css) {
  const mediaPattern = /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)\s*\{/g;
  let stripped = '';
  let cursor = 0;
  let match;

  while ((match = mediaPattern.exec(css)) !== null) {
    stripped += css.slice(cursor, match.index);

    let depth = 1;
    let index = mediaPattern.lastIndex;
    while (index < css.length && depth > 0) {
      if (css[index] === '{') depth += 1;
      if (css[index] === '}') depth -= 1;
      index += 1;
    }

    cursor = index;
    mediaPattern.lastIndex = index;
  }

  return stripped + css.slice(cursor);
}

test('app css keeps hover selectors inside desktop pointer media queries', () => {
  assert.doesNotMatch(stripDesktopHoverMedia(stylesheetSource), /:[\w-]*hover\b/);
});

test('app-owned Tailwind hover utilities are desktop-pointer gated', () => {
  const appOwnedButtonSources = [appButtonSource, authScreenSource].join('\n');
  const hoverUtilityTokens = appOwnedButtonSources
    .split(/\s+/)
    .filter((token) => token.includes('hover:'));

  assert.deepEqual(
    hoverUtilityTokens.filter((token) => !token.includes('[@media(hover:hover)_and_(pointer:fine)]:hover:')),
    []
  );
  assert.match(appOwnedButtonSources, /\[@media\(hover:hover\)_and_\(pointer:fine\)\]:hover:/);
});

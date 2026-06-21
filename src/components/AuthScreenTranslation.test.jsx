import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import AuthScreen from './AuthScreen';

vi.mock('../analytics', () => ({
  identifyUser: vi.fn(),
  trackEvent: vi.fn()
}));

vi.mock('../firebase', () => ({
  auth: { currentUser: null },
  db: {},
  doc: vi.fn(),
  setDoc: vi.fn(),
  getDoc: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  signInWithPopup: vi.fn(() => new Promise(() => {})),
  signOut: vi.fn()
}));

function simulateChromeTranslation(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];

  while (walker.nextNode()) textNodes.push(walker.currentNode);

  textNodes.forEach((textNode) => {
    if (!textNode.textContent.trim() || textNode.parentElement.closest('[translate="no"]')) return;

    const outer = document.createElement('font');
    const inner = document.createElement('font');
    textNode.replaceWith(outer);
    outer.append(inner);
    inner.append(textNode);
  });
}

test('sign-in loading state survives Chrome translation DOM wrappers', async () => {
  render(<AuthScreen />);
  expect(screen.getByText('A little window into your person’s day.')).toBeInTheDocument();
  const signInButton = screen.getByRole('button', { name: 'Continue with Google' });

  simulateChromeTranslation(signInButton);
  fireEvent.click(signInButton);

  await waitFor(() => expect(signInButton).toBeDisabled());
});

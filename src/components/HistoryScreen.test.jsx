import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import HistoryScreen from './HistoryScreen';

const photo = {
  id: 'photo-1',
  thumbnailUrl: 'thumbnail.jpg',
  photoUrl: 'full-photo.jpg'
};

function renderHistory(onSelectPhoto = vi.fn()) {
  const view = render(
    <HistoryScreen
      photos={[photo]}
      loading={false}
      hasMore={false}
      loadingMore={false}
      loadError={null}
      onLoadMore={vi.fn()}
      onSelectPhoto={onSelectPhoto}
    />
  );
  return { ...view, onSelectPhoto };
}

it('uses only the thumbnail and shows no retry control after failure', () => {
  const { container } = renderHistory();
  const image = container.querySelector('img');
  expect(image).toHaveAttribute('src', 'thumbnail.jpg');

  fireEvent.error(image);
  fireEvent.error(container.querySelector('img'));

  expect(screen.getByTestId('photo-fallback')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /try/i })).not.toBeInTheDocument();
});

it('opens the feed photo when a broken tile is selected', () => {
  const { container, onSelectPhoto } = renderHistory();
  fireEvent.error(container.querySelector('img'));
  fireEvent.error(container.querySelector('img'));

  fireEvent.click(screen.getByRole('button', { name: 'Open photo' }));
  expect(onSelectPhoto).toHaveBeenCalledWith('photo-1');
});

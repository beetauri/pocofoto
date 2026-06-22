import { fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import ResilientPhotoImage from './ResilientPhotoImage';

it('shows a skeleton until the photo loads', () => {
  render(<ResilientPhotoImage src="photo.jpg" alt="Shared moment" />);

  expect(screen.getByTestId('photo-skeleton')).toBeVisible();
  fireEvent.load(screen.getByRole('img', { name: 'Shared moment' }));
  expect(screen.queryByTestId('photo-skeleton')).not.toBeInTheDocument();
});

it('retries automatically once before showing the fallback', () => {
  const onStatusChange = vi.fn();
  render(
    <ResilientPhotoImage
      src="photo.jpg"
      alt="Shared moment"
      onStatusChange={onStatusChange}
    />
  );

  fireEvent.error(screen.getByRole('img', { name: 'Shared moment' }));
  expect(screen.getByRole('img', { name: 'Shared moment' })).toBeInTheDocument();
  expect(screen.queryByTestId('photo-fallback')).not.toBeInTheDocument();

  fireEvent.error(screen.getByRole('img', { name: 'Shared moment' }));
  expect(screen.getByTestId('photo-fallback')).toBeVisible();
  expect(onStatusChange).toHaveBeenLastCalledWith('failed');
});

it('resets after a manual retry key or source change', () => {
  const { rerender } = render(
    <ResilientPhotoImage src="broken.jpg" alt="Shared moment" retryKey={0} />
  );

  fireEvent.error(screen.getByRole('img', { name: 'Shared moment' }));
  fireEvent.error(screen.getByRole('img', { name: 'Shared moment' }));
  expect(screen.getByTestId('photo-fallback')).toBeVisible();

  rerender(<ResilientPhotoImage src="broken.jpg" alt="Shared moment" retryKey={1} />);
  expect(screen.getByTestId('photo-skeleton')).toBeVisible();
  expect(screen.getByRole('img', { name: 'Shared moment' })).toBeInTheDocument();

  rerender(<ResilientPhotoImage src="replacement.jpg" alt="Shared moment" retryKey={1} />);
  expect(screen.getByRole('img', { name: 'Shared moment' })).toHaveAttribute('src', 'replacement.jpg');
});

it('ignores an event from a superseded load attempt', () => {
  const onStatusChange = vi.fn();
  const { rerender } = render(
    <ResilientPhotoImage src="first.jpg" alt="Shared moment" onStatusChange={onStatusChange} />
  );
  const staleImage = screen.getByRole('img', { name: 'Shared moment' });

  rerender(
    <ResilientPhotoImage src="second.jpg" alt="Shared moment" onStatusChange={onStatusChange} />
  );
  fireEvent.error(staleImage);

  expect(screen.getByRole('img', { name: 'Shared moment' })).toHaveAttribute('src', 'second.jpg');
  expect(onStatusChange).not.toHaveBeenCalledWith('failed');
});

it('shows the fallback immediately when the photo source is empty', () => {
  const onStatusChange = vi.fn();
  const { container } = render(
    <ResilientPhotoImage src={undefined} alt="Shared moment" onStatusChange={onStatusChange} />
  );

  expect(screen.getByTestId('photo-fallback')).toBeInTheDocument();
  expect(container.querySelector('img')).not.toBeInTheDocument();
  expect(onStatusChange).toHaveBeenLastCalledWith('failed');
});

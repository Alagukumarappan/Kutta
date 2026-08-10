import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { ColoringGalleryTileImage } from '../../src/coloring/ColoringGalleryTileImage';
import { getDisplayImage } from '../../src/coloring/lineArtCache';

jest.mock('../../src/coloring/lineArtCache', () => ({
  getDisplayImage: jest.fn(),
}));

describe('ColoringGalleryTileImage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows the raw source uri immediately, then swaps to the converted uri once resolved', async () => {
    let resolveDisplay: (value: { uri: string; isConverted: boolean }) => void = () => {};
    (getDisplayImage as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveDisplay = resolve;
      })
    );

    const { getByTestId } = await render(
      <ColoringGalleryTileImage testID="tile-img" uri="content://source/photo.jpg" style={{}} />
    );

    expect(getByTestId('tile-img').props.source.uri).toBe('content://source/photo.jpg');

    resolveDisplay({ uri: 'file:///docs/kutta-line-art/converted.png', isConverted: true });

    await waitFor(() => {
      expect(getByTestId('tile-img').props.source.uri).toBe('file:///docs/kutta-line-art/converted.png');
    });
  });

  it('keeps showing the raw source uri if resolution fails', async () => {
    (getDisplayImage as jest.Mock).mockRejectedValue(new Error('decode failed'));

    const { getByTestId } = await render(
      <ColoringGalleryTileImage testID="tile-img" uri="content://source/corrupt.jpg" style={{}} />
    );

    await waitFor(() => {
      expect(getDisplayImage).toHaveBeenCalled();
    });
    expect(getByTestId('tile-img').props.source.uri).toBe('content://source/corrupt.jpg');
  });
});

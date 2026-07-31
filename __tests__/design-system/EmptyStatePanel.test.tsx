import React from 'react';
import { render, fireEvent, act, cleanup } from '@testing-library/react-native';
import { EmptyStatePanel } from '../../src/design-system/EmptyStatePanel';

describe('EmptyStatePanel', () => {
  afterEach(cleanup);

  it('renders the emoji, title, and message', async () => {
    const { getByText } = await render(
      <EmptyStatePanel emoji="🖼️" title="No pictures yet" message="Ask a grown-up to add some" />
    );
    expect(getByText('🖼️')).toBeTruthy();
    expect(getByText('No pictures yet')).toBeTruthy();
    expect(getByText('Ask a grown-up to add some')).toBeTruthy();
  });

  it('does not render an action button when none is given', async () => {
    const { queryByText } = await render(<EmptyStatePanel emoji="🎨" title="No coloring pages yet" />);
    expect(queryByText(/add/i)).toBeNull();
  });

  it('renders and fires the action button when both actionLabel and onAction are given', async () => {
    const onAction = jest.fn();
    const { getByText } = await render(
      <EmptyStatePanel emoji="🎬" title="No videos yet" actionLabel="Add videos" onAction={onAction} />
    );

    await fireEvent.press(getByText('Add videos'));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('stops its bounce animation on unmount without throwing', async () => {
    jest.useFakeTimers();
    const { unmount } = await render(<EmptyStatePanel emoji="🧩" title="No puzzles yet" />);

    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(() => unmount()).not.toThrow();
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    jest.useRealTimers();
  });
});

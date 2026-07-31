import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { CelebrationOverlay } from '../../src/design-system/CelebrationOverlay';

describe('CelebrationOverlay', () => {
  it('renders nothing when not visible', async () => {
    const { queryByTestId } = await render(<CelebrationOverlay visible={false} title="Nice!" />);
    expect(queryByTestId('celebration-overlay')).toBeNull();
  });

  it('shows the title, message, and celebration bubble when visible with tone="success"', async () => {
    const { getByText, getByTestId } = await render(
      <CelebrationOverlay visible title="Great job!" message="You finished the puzzle" emoji="🎉" tone="success" />
    );
    expect(getByText('Great job!')).toBeTruthy();
    expect(getByText('You finished the puzzle')).toBeTruthy();
    expect(getByTestId('celebration-bubble')).toBeTruthy();
    expect(getByText('🎉')).toBeTruthy();
  });

  it('does not render the celebration bubble for tone="neutral"', async () => {
    const { queryByTestId } = await render(
      <CelebrationOverlay visible title="No pictures yet" emoji="🖼️" tone="neutral" />
    );
    expect(queryByTestId('celebration-bubble')).toBeNull();
  });

  it('renders and fires each action button', async () => {
    const onPrimary = jest.fn();
    const onSecondary = jest.fn();
    const { getByText } = await render(
      <CelebrationOverlay
        visible
        title="All done"
        actions={[
          { label: 'Play Again', onPress: onPrimary },
          { label: 'Home', onPress: onSecondary, variant: 'secondary' },
        ]}
      />
    );

    await fireEvent.press(getByText('Play Again'));
    expect(onPrimary).toHaveBeenCalledTimes(1);

    await fireEvent.press(getByText('Home'));
    expect(onSecondary).toHaveBeenCalledTimes(1);
  });

  it('stops its animations and unmounts cleanly', async () => {
    jest.useFakeTimers();
    const { unmount } = await render(<CelebrationOverlay visible title="Great job!" emoji="🎉" tone="success" />);

    await act(async () => {
      jest.advanceTimersByTime(300);
    });
    expect(() => unmount()).not.toThrow();
    jest.useRealTimers();
  });
});

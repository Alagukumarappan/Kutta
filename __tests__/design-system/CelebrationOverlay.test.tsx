import React from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
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

  // Regression tests for the premium-polish accessibility pass: the card
  // entrance and celebration bubble always used a bouncy Animated.spring,
  // completely ignoring the OS "reduce motion" setting — a real
  // vestibular-safety gap, not a style nitpick, since this component backs
  // every activity's completion celebration (Quiz, Puzzle, Tic-Tac-Toe,
  // Video).
  describe('reduced motion', () => {
    afterEach(() => {
      jest.restoreAllMocks();
    });

    // In real usage, CelebrationOverlay's host screen mounts it well before
    // the activity actually finishes (`visible` starts false and only flips
    // true later), so the async reduce-motion check has already resolved by
    // the time an entrance animation is ever requested. The test mirrors
    // that: mount with visible=false first, let the check resolve, THEN
    // flip visible to true and assert on the entrance that follows.
    it('skips the bouncy spring entirely when the OS reduce-motion setting is on, animating opacity only', async () => {
      jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
      const springSpy = jest.spyOn(Animated, 'spring');
      const timingSpy = jest.spyOn(Animated, 'timing');

      const { rerender } = await render(
        <CelebrationOverlay visible={false} title="Great job!" emoji="🎉" tone="success" />
      );
      await act(async () => {
        rerender(<CelebrationOverlay visible title="Great job!" emoji="🎉" tone="success" />);
      });

      expect(springSpy).not.toHaveBeenCalled();
      expect(timingSpy).toHaveBeenCalled();
    });

    it('still uses the normal bouncy spring when reduce-motion is off', async () => {
      jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
      const springSpy = jest.spyOn(Animated, 'spring');

      const { rerender } = await render(
        <CelebrationOverlay visible={false} title="Great job!" emoji="🎉" tone="success" />
      );
      await act(async () => {
        rerender(<CelebrationOverlay visible title="Great job!" emoji="🎉" tone="success" />);
      });

      expect(springSpy).toHaveBeenCalled();
    });
  });
});

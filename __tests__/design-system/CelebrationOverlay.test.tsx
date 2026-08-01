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

  // Regression test: this overlay is the completion dialog for every
  // activity (Quiz, Puzzle, Tic-Tac-Toe, Video) and pops in over content a
  // screen-reader user may already be exploring. Without
  // accessibilityViewIsModal, VoiceOver/TalkBack can keep navigating the
  // now-hidden content behind it; without accessibilityRole="alert" +
  // accessibilityLiveRegion, the screen reader never announces that the
  // dialog appeared at all.
  it('marks the card as a modal and gives the title an announcing role', async () => {
    const { getByText, getByTestId } = await render(
      <CelebrationOverlay visible title="Great job!" message="You finished the puzzle" emoji="🎉" tone="success" />
    );

    const titleNode = getByText('Great job!');
    expect(titleNode.props.accessibilityRole).toBe('alert');
    expect(titleNode.props.accessibilityLiveRegion).toBe('polite');

    // The card's Animated.View is the direct parent of cardClip, which is
    // the direct parent of the title Text - walk up two levels from the
    // celebration bubble's sibling to reach it via a stable testID instead.
    expect(getByTestId('celebration-overlay-card').props.accessibilityViewIsModal).toBe(true);
  });

  // VoiceOver on iOS does not auto-announce an element just because it has
  // accessibilityRole="alert" - it needs an explicit announcement, unlike
  // Android's TalkBack which does honor accessibilityLiveRegion on its own.
  it('explicitly announces the title and message to screen readers when it becomes visible', async () => {
    const announceSpy = jest.spyOn(AccessibilityInfo, 'announceForAccessibility').mockImplementation(() => {});

    const { rerender } = await render(
      <CelebrationOverlay visible={false} title="Great job!" message="You finished the puzzle" emoji="🎉" tone="success" />
    );
    // Other tests in this file mount visible celebration overlays whose
    // effects can still be flushing async work when this test starts, so
    // clear the spy right after this test's own (invisible) mount rather
    // than asserting a global "never called" before that point.
    announceSpy.mockClear();

    await act(async () => {
      rerender(
        <CelebrationOverlay visible title="Great job!" message="You finished the puzzle" emoji="🎉" tone="success" />
      );
    });

    expect(announceSpy).toHaveBeenCalledWith('Great job!. You finished the puzzle');
    announceSpy.mockRestore();
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

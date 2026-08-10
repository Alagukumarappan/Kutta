import React from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { CelebrationOverlay } from '../../src/design-system/CelebrationOverlay';

describe('CelebrationOverlay', () => {
  it('renders nothing when not visible', async () => {
    const { queryByTestId } = await render(<CelebrationOverlay onRequestClose={jest.fn()} visible={false} title="Nice!" />);
    expect(queryByTestId('celebration-overlay')).toBeNull();
  });

  it('shows the title, message, and celebration bubble when visible with tone="success"', async () => {
    const { getByText, getByTestId } = await render(
      <CelebrationOverlay onRequestClose={jest.fn()} visible title="Great job!" message="You finished the puzzle" emoji="🎉" tone="success" />
    );
    expect(getByText('Great job!')).toBeTruthy();
    expect(getByText('You finished the puzzle')).toBeTruthy();
    expect(getByTestId('celebration-bubble')).toBeTruthy();
    expect(getByText('🎉')).toBeTruthy();
  });

  it('does not render the celebration bubble for tone="neutral"', async () => {
    const { queryByTestId } = await render(
      <CelebrationOverlay onRequestClose={jest.fn()} visible title="No pictures yet" emoji="🖼️" tone="neutral" />
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
      <CelebrationOverlay onRequestClose={jest.fn()} visible title="Great job!" message="You finished the puzzle" emoji="🎉" tone="success" />
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
      <CelebrationOverlay onRequestClose={jest.fn()} visible={false} title="Great job!" message="You finished the puzzle" emoji="🎉" tone="success" />
    );
    // Other tests in this file mount visible celebration overlays whose
    // effects can still be flushing async work when this test starts, so
    // clear the spy right after this test's own (invisible) mount rather
    // than asserting a global "never called" before that point.
    announceSpy.mockClear();

    await act(async () => {
      rerender(
        <CelebrationOverlay onRequestClose={jest.fn()} visible title="Great job!" message="You finished the puzzle" emoji="🎉" tone="success" />
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
        onRequestClose={jest.fn()}
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
  });

  it('renders and fires the secondary action button', async () => {
    const onPrimary = jest.fn();
    const onSecondary = jest.fn();
    const { getByText } = await render(
      <CelebrationOverlay
        onRequestClose={jest.fn()}
        visible
        title="All done"
        actions={[
          { label: 'Play Again', onPress: onPrimary },
          { label: 'Home', onPress: onSecondary, variant: 'secondary' },
        ]}
      />
    );

    // Separate render from the primary-action test above on purpose: one
    // presentation of this panel now only ever fires ONE exit (see the
    // batched-two-finger test below), so pressing both buttons on the same
    // still-visible panel is exactly the case that is deliberately blocked.
    await fireEvent.press(getByText('Home'));
    expect(onSecondary).toHaveBeenCalledTimes(1);
    expect(onPrimary).not.toHaveBeenCalled();
  });

  // Regression test: the per-screen double-fire guards each host has are
  // per-BUTTON (Puzzle's retryFiredRef vs nextFiredRef, Tic-Tac-Toe's
  // retryFiredRef vs menuFiredRef), so nothing stopped two DIFFERENT exits
  // firing together. React Native gives each concurrent touch its own view
  // and delivers the queued events in one JS batch, so a child with two
  // fingers down — one on "Play Again", one on "Change setup" — ran both:
  // the board reset AND the screen popped away, writing state into a screen
  // already leaving. Same batched-tap class as iterations 3-7.
  it('fires only the first exit when two different actions land in one touch batch', async () => {
    const onPrimary = jest.fn();
    const onSecondary = jest.fn();
    const { getByText } = await render(
      <CelebrationOverlay
        onRequestClose={jest.fn()}
        visible
        title="All done"
        actions={[
          { label: 'Play Again', onPress: onPrimary },
          { label: 'Home', onPress: onSecondary, variant: 'secondary' },
        ]}
      />
    );

    // React logs "overlapping act() calls" for the deliberately-nested
    // presses below; that is the point — it is what a real touch batch looks
    // like. Same shape as TicTacToeScreen's own batched-tap regression test.
    await act(async () => {
      fireEvent.press(getByText('Play Again'));
      fireEvent.press(getByText('Home'));
    });

    expect(onPrimary).toHaveBeenCalledTimes(1);
    expect(onSecondary).not.toHaveBeenCalled();
  });

  describe('close (X) button', () => {
    it('calls onRequestClose when pressed', async () => {
      const onRequestClose = jest.fn();
      const { getByTestId } = await render(
        <CelebrationOverlay onRequestClose={onRequestClose} visible title="All done" />
      );

      await fireEvent.press(getByTestId('celebration-overlay-close'));

      expect(onRequestClose).toHaveBeenCalledTimes(1);
    });

    it('has an accessible label', async () => {
      const { getByTestId } = await render(
        <CelebrationOverlay onRequestClose={jest.fn()} visible title="All done" closeLabel="Close" />
      );

      const closeButton = getByTestId('celebration-overlay-close');
      expect(closeButton.props.accessibilityRole).toBe('button');
      expect(closeButton.props.accessibilityLabel).toBe('Close');
    });

    it('shares the same one-exit-only latch as the action buttons', async () => {
      const onRequestClose = jest.fn();
      const onPrimary = jest.fn();
      const { getByTestId, getByText } = await render(
        <CelebrationOverlay
          onRequestClose={onRequestClose}
          visible
          title="All done"
          actions={[{ label: 'Play Again', onPress: onPrimary }]}
        />
      );

      await act(async () => {
        fireEvent.press(getByTestId('celebration-overlay-close'));
        fireEvent.press(getByText('Play Again'));
      });

      expect(onRequestClose).toHaveBeenCalledTimes(1);
      expect(onPrimary).not.toHaveBeenCalled();
    });
  });

  // Regression test for iteration 8: this Modal had no onRequestClose at
  // all, so Android's hardware/gesture back was captured by the modal's own
  // window and silently dropped on EVERY activity's completion panel
  // (Puzzle, Tic-Tac-Toe, Video) — and every activity screen is
  // headerShown:false, so back is the child's only way out.
  it('routes the Android back button to onRequestClose, once', async () => {
    const onRequestClose = jest.fn();
    const onPrimary = jest.fn();
    const { getByTestId, getByText } = await render(
      <CelebrationOverlay
        onRequestClose={onRequestClose}
        visible
        title="All done"
        testID="celebration-overlay"
        actions={[{ label: 'Play Again', onPress: onPrimary }]}
      />
    );

    const modal = getByTestId('celebration-overlay');
    expect(modal.props.onRequestClose).toBeDefined();
    await act(async () => {
      modal.props.onRequestClose();
    });
    expect(onRequestClose).toHaveBeenCalledTimes(1);

    // Back shares the same one-exit-per-presentation latch as the buttons,
    // so a back press batched together with a tap on the visible action
    // cannot double-fire two different exits.
    await act(async () => {
      modal.props.onRequestClose();
      fireEvent.press(getByText('Play Again'));
    });
    expect(onRequestClose).toHaveBeenCalledTimes(1);
    expect(onPrimary).not.toHaveBeenCalled();
  });

  it('re-arms its actions the next time it becomes visible', async () => {
    const onPrimary = jest.fn();
    const overlay = (visible: boolean) => (
      <CelebrationOverlay
        onRequestClose={jest.fn()}
        visible={visible}
        title="All done"
        actions={[{ label: 'Play Again', onPress: onPrimary }]}
      />
    );

    const { getByText, rerender } = await render(overlay(true));
    await fireEvent.press(getByText('Play Again'));
    expect(onPrimary).toHaveBeenCalledTimes(1);

    // Every host hides this panel in response to an action, so the latch has
    // to release on the way down — otherwise a second puzzle/game would show
    // a completion panel with dead buttons.
    await act(async () => {
      rerender(overlay(false));
    });
    await act(async () => {
      rerender(overlay(true));
    });
    await fireEvent.press(getByText('Play Again'));
    expect(onPrimary).toHaveBeenCalledTimes(2);
  });

  it('stops its animations and unmounts cleanly', async () => {
    jest.useFakeTimers();
    const { unmount } = await render(<CelebrationOverlay onRequestClose={jest.fn()} visible title="Great job!" emoji="🎉" tone="success" />);

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
        <CelebrationOverlay onRequestClose={jest.fn()} visible={false} title="Great job!" emoji="🎉" tone="success" />
      );
      await act(async () => {
        rerender(<CelebrationOverlay onRequestClose={jest.fn()} visible title="Great job!" emoji="🎉" tone="success" />);
      });

      expect(springSpy).not.toHaveBeenCalled();
      expect(timingSpy).toHaveBeenCalled();
    });

    it('still uses the normal bouncy spring when reduce-motion is off', async () => {
      jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
      const springSpy = jest.spyOn(Animated, 'spring');

      const { rerender } = await render(
        <CelebrationOverlay onRequestClose={jest.fn()} visible={false} title="Great job!" emoji="🎉" tone="success" />
      );
      await act(async () => {
        rerender(<CelebrationOverlay onRequestClose={jest.fn()} visible title="Great job!" emoji="🎉" tone="success" />);
      });

      expect(springSpy).toHaveBeenCalled();
    });
  });
});

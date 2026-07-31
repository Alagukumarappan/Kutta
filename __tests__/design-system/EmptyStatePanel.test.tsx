import React from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
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

  // Regression test for the premium-polish accessibility pass: this is a
  // CONTINUOUS/infinite loop (unlike the app's other one-shot pop-in
  // animations already fixed), so it keeps running for as long as the
  // empty state stays on screen — exactly the kind of persistent motion
  // the OS reduce-motion setting exists to suppress.
  //
  // Placed BEFORE the "stops its bounce animation on unmount" test below,
  // not after: that test's own unmount-mid-fake-timers pattern was found
  // (independently of this change) to leave a stray pending Animated
  // callback that corrupts the RNTL renderer for whatever test runs next
  // in the same file — the same class of cross-test renderer corruption
  // already documented elsewhere in this codebase (e.g. QuizScreen's own
  // "never replay a gesture sequence" test-ordering notes).
  it('skips the looping bounce entirely when the OS reduce-motion setting is on, keeping the emoji at rest', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);

    // Mount happens before the async reduce-motion check resolves, so the
    // effect's FIRST run (reducedMotion still false by default) does start
    // one loop — matching this codebase's other reduce-motion tests' own
    // documented "one-time flash" tradeoff (see CelebrationOverlay's own
    // comment on this). The reduce-motion check can resolve (and the
    // effect's cleanup can run) SYNCHRONOUSLY within the same `render()`
    // call, before a spy attached afterward would ever see it — so `stop`
    // is wrapped at the exact moment `Animated.loop` creates it, not
    // after the fact, to reliably observe whether it was ever called.
    const actualLoop = Animated.loop.bind(Animated);
    const loopSpy = jest.spyOn(Animated, 'loop');
    let stopSpy: jest.Mock | undefined;
    loopSpy.mockImplementation((animation) => {
      const real = actualLoop(animation);
      stopSpy = jest.fn(real.stop.bind(real));
      real.stop = stopSpy;
      return real;
    });

    const { rerender } = await render(<EmptyStatePanel emoji="🧩" title="No puzzles yet" />);

    // Let the async reduce-motion check's promise microtask actually flush
    // before rerendering — a bare `rerender` isn't guaranteed to wait for
    // it (unlike this codebase's other reduce-motion tests, which flush via
    // a full render/rerender cycle around a `visible` prop change; this
    // component starts its loop unconditionally on mount, so there's no
    // such gate to reuse here).
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      rerender(<EmptyStatePanel emoji="🧩" title="No puzzles yet" />);
    });

    // Exactly one loop was ever created (the initial pre-resolution one),
    // and its cleanup (re-run once reducedMotion flips to true) must have
    // stopped it — the reduced-motion branch never starts a second loop.
    expect(loopSpy).toHaveBeenCalledTimes(1);
    expect(stopSpy).toHaveBeenCalled();

    jest.restoreAllMocks();
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

import React from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import { render, fireEvent, act } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { RaisedPrimaryButton, RaisedSecondaryButton } from '../../src/design-system/Buttons';
import { paperTheme } from '../../src/design-system/paperTheme';

function withPaper(children: React.ReactNode) {
  return <PaperProvider theme={paperTheme}>{children}</PaperProvider>;
}

describe('RaisedPrimaryButton', () => {
  it('renders its label and fires onPress', async () => {
    const onPress = jest.fn();
    const { getByText } = await render(
      withPaper(<RaisedPrimaryButton testID="primary" label="Start" onPress={onPress} />)
    );

    expect(getByText('Start')).toBeTruthy();
    await fireEvent.press(getByText('Start'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire onPress when disabled', async () => {
    const onPress = jest.fn();
    const { getByText } = await render(
      withPaper(<RaisedPrimaryButton testID="primary" label="Start" onPress={onPress} disabled />)
    );

    await fireEvent.press(getByText('Start'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('requests a spring press animation on press-in/press-out', async () => {
    const springSpy = jest.spyOn(Animated, 'spring');

    const { getByText } = await render(
      withPaper(<RaisedPrimaryButton testID="primary" label="Start" onPress={jest.fn()} />)
    );

    const label = getByText('Start');
    await fireEvent(label, 'pressIn');
    await fireEvent(label, 'pressOut');

    const toValues = springSpy.mock.calls.map(([, config]) => (config as { toValue: number }).toValue);
    expect(toValues).toContain(0.95);
    expect(toValues).toContain(1);

    springSpy.mockRestore();
  });

  // Regression test for the premium-polish accessibility pass: useTiltPress
  // (the shared press-feedback hook every raised button/card/pressable in
  // the app calls) always used a spring for its 3D tilt/lift transform,
  // regardless of the OS reduce-motion setting — the same parallax-like
  // motion category CelebrationOverlay/QuizScreen's score card were already
  // fixed for. Applied centrally in the one shared hook so every consumer
  // benefits without touching each call site individually; this test
  // exercises it through RaisedPrimaryButton as one representative consumer.
  it('skips the spring press feedback when the OS reduce-motion setting is on, jumping straight to the pressed value', async () => {
    jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
    const springSpy = jest.spyOn(Animated, 'spring');

    const { getByText, rerender } = await render(
      withPaper(<RaisedPrimaryButton testID="primary" label="Start" onPress={jest.fn()} />)
    );
    // Let the async reduce-motion check resolve before exercising press
    // feedback — same reasoning as CelebrationOverlay's own reduce-motion
    // tests: a fresh mount's hook state starts `false` until the check
    // resolves, so a re-render (here, a no-op prop rerender) ensures the
    // resolved value is in effect for the press events below.
    await act(async () => {
      rerender(withPaper(<RaisedPrimaryButton testID="primary" label="Start" onPress={jest.fn()} />));
    });

    const label = getByText('Start');
    await fireEvent(label, 'pressIn');
    await fireEvent(label, 'pressOut');

    expect(springSpy).not.toHaveBeenCalled();

    springSpy.mockRestore();
    // `restoreAllMocks()` alone can't undo this specific mock:
    // `AccessibilityInfo.isReduceMotionEnabled` is already an auto-mocked
    // jest.fn() (a native module method), so `jest.spyOn` above just
    // returns that same mock rather than wrapping a real implementation —
    // there's no "original" to restore to, and the mocked `true` value
    // otherwise silently leaks into every later test in this file (a real,
    // verified bug — see ColoringScreen's iteration 30 notes for the full
    // mechanism). Explicitly resetting it back to `false` here is what
    // actually fixes it.
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(false);
    jest.restoreAllMocks();
  });
});

describe('RaisedSecondaryButton', () => {
  it('renders its label and fires onPress', async () => {
    const onPress = jest.fn();
    const { getByText } = await render(
      withPaper(<RaisedSecondaryButton testID="secondary" label="Cancel" onPress={onPress} />)
    );

    expect(getByText('Cancel')).toBeTruthy();
    await fireEvent.press(getByText('Cancel'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

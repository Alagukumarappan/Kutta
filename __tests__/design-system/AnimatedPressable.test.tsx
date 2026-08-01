import React from 'react';
import { Text, Animated } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { AnimatedPressable } from '../../src/design-system/AnimatedPressable';

describe('AnimatedPressable', () => {
  it('renders its children and fires onPress on a normal tap', async () => {
    const onPress = jest.fn();
    const { getByText, getByTestId } = await render(
      <AnimatedPressable testID="my-pressable" onPress={onPress}>
        <Text>Tap me</Text>
      </AnimatedPressable>
    );

    expect(getByText('Tap me')).toBeTruthy();
    await fireEvent.press(getByTestId('my-pressable'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not call onPress when disabled', async () => {
    const onPress = jest.fn();
    const { getByTestId } = await render(
      <AnimatedPressable testID="my-pressable" onPress={onPress} disabled>
        <Text>Tap me</Text>
      </AnimatedPressable>
    );

    await fireEvent.press(getByTestId('my-pressable'));
    expect(onPress).not.toHaveBeenCalled();
  });

  // Same safe convention this codebase's other Animated-wiring tests use
  // (see ColoringScreen.test.tsx's palette-pop/toolbar-press tests): drive
  // the wiring via RNTL's fireEvent(el, 'pressIn'/'pressOut') — which calls
  // the onPressIn/onPressOut PROPS directly rather than replaying a raw
  // native gesture-responder sequence — and assert on Animated.spring's own
  // call args, never on the settled style (Jest's Animated mock doesn't
  // advance a running spring without an explicit fake-timer tick) and never
  // via a raw responder-event replay (which has repeatedly corrupted this
  // project's RNTL renderer for later tests, per HomeScreen.test.tsx).
  it('requests a spring toward the pressed-down scale on press-in and back to rest on press-out', async () => {
    const springSpy = jest.spyOn(Animated, 'spring');

    const { getByTestId } = await render(
      <AnimatedPressable testID="my-pressable" onPress={jest.fn()}>
        <Text>Tap me</Text>
      </AnimatedPressable>
    );

    const pressable = getByTestId('my-pressable');
    await fireEvent(pressable, 'pressIn');
    await fireEvent(pressable, 'pressOut');

    const toValues = springSpy.mock.calls.map(([, config]) => (config as { toValue: number }).toValue);
    expect(toValues).toContain(0.95); // 'regular' tilt preset's pressedScale
    expect(toValues).toContain(1);

    springSpy.mockRestore();
  });

  it('uses the compact tilt preset\'s pressed scale when tilt="compact"', async () => {
    const springSpy = jest.spyOn(Animated, 'spring');

    const { getByTestId } = await render(
      <AnimatedPressable testID="my-pressable" onPress={jest.fn()} tilt="compact">
        <Text>Tap me</Text>
      </AnimatedPressable>
    );

    await fireEvent(getByTestId('my-pressable'), 'pressIn');

    const toValues = springSpy.mock.calls.map(([, config]) => (config as { toValue: number }).toValue);
    expect(toValues).toContain(0.95); // compact preset also uses 0.95 pressedScale per tokens.ts

    springSpy.mockRestore();
  });

  it('does not start a press animation when disabled', async () => {
    const springSpy = jest.spyOn(Animated, 'spring');
    springSpy.mockClear();

    const { getByTestId } = await render(
      <AnimatedPressable testID="my-pressable" onPress={jest.fn()} disabled>
        <Text>Tap me</Text>
      </AnimatedPressable>
    );

    await fireEvent(getByTestId('my-pressable'), 'pressIn');
    await fireEvent(getByTestId('my-pressable'), 'pressOut');

    expect(springSpy).not.toHaveBeenCalled();
    springSpy.mockRestore();
  });

  // Regression tests for the premium-polish accessibility pass: this
  // shared component had no way to expose a "selected" state at all —
  // VideoGallery/ColoringGallery/PuzzleGallery's long-press multi-select
  // mode visually checks a tile (a badge + border color change) but a
  // screen-reader user had no indication which tiles were checked.
  it('exposes accessibilityState.selected when the selected prop is provided', async () => {
    const { getByTestId } = await render(
      <AnimatedPressable testID="my-pressable" onPress={jest.fn()} selected>
        <Text>Tap me</Text>
      </AnimatedPressable>
    );

    expect(getByTestId('my-pressable').props.accessibilityState).toEqual({ selected: true });
  });

  it('does not report a disabled or selected accessibility state when neither is set', async () => {
    const { getByTestId } = await render(
      <AnimatedPressable testID="my-pressable" onPress={jest.fn()}>
        <Text>Tap me</Text>
      </AnimatedPressable>
    );

    // RN's Pressable normalizes an `undefined` accessibilityState prop into
    // a full object with every field undefined at the host-component level
    // (not a literal `undefined`), so check the meaningful fields directly
    // rather than the object identity.
    const state = getByTestId('my-pressable').props.accessibilityState;
    expect(state?.disabled).toBeUndefined();
    expect(state?.selected).toBeUndefined();
  });

  it('combines disabled and selected into one accessibilityState object when both are set', async () => {
    const { getByTestId } = await render(
      <AnimatedPressable testID="my-pressable" onPress={jest.fn()} disabled selected={false}>
        <Text>Tap me</Text>
      </AnimatedPressable>
    );

    expect(getByTestId('my-pressable').props.accessibilityState).toEqual({ disabled: true, selected: false });
  });

  it('cleans up any in-flight animation on unmount without throwing', async () => {
    const { getByTestId, unmount } = await render(
      <AnimatedPressable testID="my-pressable" onPress={jest.fn()}>
        <Text>Tap me</Text>
      </AnimatedPressable>
    );

    await fireEvent(getByTestId('my-pressable'), 'pressIn');
    expect(() => unmount()).not.toThrow();
  });
});

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { TicTacToeSetupScreen } from '../../src/tictactoe/TicTacToeSetupScreen';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import { paperTheme } from '../../src/design-system/paperTheme';

// The friend-name field now builds on react-native-paper's own TextInput,
// which in the real app always renders inside App.tsx's top-level
// <PaperProvider theme={paperTheme}> — mirrored here (same pattern as
// __tests__/onboarding/OnboardingScreen.test.tsx) so Paper's theme context
// is present exactly like production, not just its bare built-in default.
function renderScreen(onStart: jest.Mock = jest.fn()) {
  return render(
    <PaperProvider theme={paperTheme}>
      <LanguageProvider initialLanguage="en">
        <TicTacToeSetupScreen onStart={onStart} />
      </LanguageProvider>
    </PaperProvider>
  );
}

describe('TicTacToeSetupScreen', () => {
  it('disables Start Game until an opponent is chosen', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('tictactoe-start-game').props.accessibilityState?.disabled).toBe(true);
  });

  it('keeps Start Game disabled for Friend mode until a name is typed, no difficulty required', async () => {
    const onStart = jest.fn();
    const { getByTestId } = await renderScreen(onStart);

    await fireEvent.press(getByTestId('tictactoe-opponent-friend'));
    expect(getByTestId('tictactoe-start-game').props.accessibilityState?.disabled).toBe(true);

    await fireEvent.changeText(getByTestId('tictactoe-friend-name-input'), 'Alex');
    expect(getByTestId('tictactoe-start-game').props.accessibilityState?.disabled).toBe(false);

    await fireEvent.press(getByTestId('tictactoe-start-game'));
    expect(onStart).toHaveBeenCalledWith('friend', null, 'Alex');
  });

  it('does not enable Start for a name that is only whitespace', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('tictactoe-opponent-friend'));
    await fireEvent.changeText(getByTestId('tictactoe-friend-name-input'), '   ');

    expect(getByTestId('tictactoe-start-game').props.accessibilityState?.disabled).toBe(true);
  });

  it('trims the friend name before passing it to onStart', async () => {
    const onStart = jest.fn();
    const { getByTestId } = await renderScreen(onStart);

    await fireEvent.press(getByTestId('tictactoe-opponent-friend'));
    await fireEvent.changeText(getByTestId('tictactoe-friend-name-input'), '  Alex  ');
    await fireEvent.press(getByTestId('tictactoe-start-game'));

    expect(onStart).toHaveBeenCalledWith('friend', null, 'Alex');
  });

  // Regression test for a real bug fix: this name is later rendered
  // centered and unbounded on TicTacToeScreen's statusText and the shared
  // CelebrationOverlay's completion title, neither of which truncates or
  // scrolls — an arbitrarily long name could wrap across many lines on a
  // short, landscape-locked screen and push the board/completion actions
  // out of view.
  it('caps the friend name at a sensible maximum length', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('tictactoe-opponent-friend'));

    expect(getByTestId('tictactoe-friend-name-input').props.maxLength).toBe(20);
  });

  // The `maxLength` prop above only enforces truncation at the native
  // widget level for direct typing — RNTL's fireEvent.changeText calls
  // onChangeText directly with the FULL string, bypassing that native
  // behavior entirely (and some real Android IME paths have historically
  // been able to bypass native maxLength too). This test proves the
  // ACTUAL clamp: the friendName state itself is truncated in
  // handleFriendNameChange, not just the input's own display.
  it('clamps the underlying friend name state itself, not just the input prop', async () => {
    const onStart = jest.fn();
    const { getByTestId } = await renderScreen(onStart);

    await fireEvent.press(getByTestId('tictactoe-opponent-friend'));
    await fireEvent.changeText(getByTestId('tictactoe-friend-name-input'), 'x'.repeat(50));
    await fireEvent.press(getByTestId('tictactoe-start-game'));

    expect(onStart).toHaveBeenCalledWith('friend', null, 'x'.repeat(20));
  });

  it('does not show a difficulty picker until Computer is chosen', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    expect(queryByTestId('tictactoe-difficulty-easy')).toBeNull();

    await fireEvent.press(getByTestId('tictactoe-opponent-computer'));
    expect(getByTestId('tictactoe-difficulty-easy')).toBeTruthy();
    expect(getByTestId('tictactoe-difficulty-medium')).toBeTruthy();
    expect(getByTestId('tictactoe-difficulty-hard')).toBeTruthy();
  });

  it('keeps Start Game disabled for Computer mode until a difficulty is picked, then starts with it', async () => {
    const onStart = jest.fn();
    const { getByTestId } = await renderScreen(onStart);

    await fireEvent.press(getByTestId('tictactoe-opponent-computer'));
    expect(getByTestId('tictactoe-start-game').props.accessibilityState?.disabled).toBe(true);

    await fireEvent.press(getByTestId('tictactoe-difficulty-hard'));
    expect(getByTestId('tictactoe-start-game').props.accessibilityState?.disabled).toBe(false);

    await fireEvent.press(getByTestId('tictactoe-start-game'));
    expect(onStart).toHaveBeenCalledWith('computer', 'hard', undefined);
  });

  it('switching from Computer back to Friend drops the previously-picked difficulty from the start payload', async () => {
    const onStart = jest.fn();
    const { getByTestId } = await renderScreen(onStart);

    await fireEvent.press(getByTestId('tictactoe-opponent-computer'));
    await fireEvent.press(getByTestId('tictactoe-difficulty-easy'));
    await fireEvent.press(getByTestId('tictactoe-opponent-friend'));
    await fireEvent.changeText(getByTestId('tictactoe-friend-name-input'), 'Alex');
    await fireEvent.press(getByTestId('tictactoe-start-game'));

    expect(onStart).toHaveBeenCalledWith('friend', null, 'Alex');
  });

  // Regression test for the premium-polish bug hunt: handleStart had no
  // double-fire guard before calling onStart (which RootNavigator wires
  // straight to navigation.navigate) — unlike HomeScreen's own cards
  // (navLockRef), a rapid double-tap here could push the game screen onto
  // the stack twice, since this setup screen stays mounted (not unmounted)
  // underneath the pushed screen.
  it('guards a rapid double-tap on Start against navigating twice, but re-arms after a short delay for a later legitimate start', async () => {
    jest.useFakeTimers();
    const onStart = jest.fn();
    const { getByTestId } = await renderScreen(onStart);

    await fireEvent.press(getByTestId('tictactoe-opponent-friend'));
    await fireEvent.changeText(getByTestId('tictactoe-friend-name-input'), 'Alex');

    // Same "stale double-tap" shape as HomeScreen's own card guard test:
    // press the SAME captured element twice without re-querying.
    const startButton = getByTestId('tictactoe-start-game');
    await fireEvent.press(startButton);
    await fireEvent.press(startButton);

    expect(onStart).toHaveBeenCalledTimes(1);

    // Re-arms after HomeScreen's own 800ms window — a parent backing out to
    // this screen and legitimately starting again must still work.
    jest.advanceTimersByTime(800);
    await fireEvent.press(startButton);
    expect(onStart).toHaveBeenCalledTimes(2);

    jest.useRealTimers();
  });
});

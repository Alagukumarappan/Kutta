import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { TicTacToeSetupScreen } from '../../src/tictactoe/TicTacToeSetupScreen';
import { LanguageProvider } from '../../src/i18n/LanguageContext';

function renderScreen(onStart: jest.Mock = jest.fn()) {
  return render(
    <LanguageProvider initialLanguage="en">
      <TicTacToeSetupScreen onStart={onStart} />
    </LanguageProvider>
  );
}

describe('TicTacToeSetupScreen', () => {
  it('disables Start Game until an opponent is chosen', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('tictactoe-start-game').props.accessibilityState?.disabled).toBe(true);
  });

  it('lets the parent start immediately against a friend, with no difficulty required', async () => {
    const onStart = jest.fn();
    const { getByTestId } = await renderScreen(onStart);

    await fireEvent.press(getByTestId('tictactoe-opponent-friend'));
    expect(getByTestId('tictactoe-start-game').props.accessibilityState?.disabled).toBe(false);

    await fireEvent.press(getByTestId('tictactoe-start-game'));
    expect(onStart).toHaveBeenCalledWith('friend', null);
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
    expect(onStart).toHaveBeenCalledWith('computer', 'hard');
  });

  it('switching from Computer back to Friend drops the previously-picked difficulty from the start payload', async () => {
    const onStart = jest.fn();
    const { getByTestId } = await renderScreen(onStart);

    await fireEvent.press(getByTestId('tictactoe-opponent-computer'));
    await fireEvent.press(getByTestId('tictactoe-difficulty-easy'));
    await fireEvent.press(getByTestId('tictactoe-opponent-friend'));
    await fireEvent.press(getByTestId('tictactoe-start-game'));

    expect(onStart).toHaveBeenCalledWith('friend', null);
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

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { MemoryMatchSetupScreen } from '../../src/memoryMatch/MemoryMatchSetupScreen';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import { paperTheme } from '../../src/design-system/paperTheme';

function renderSetup(onStart = jest.fn()) {
  return render(
    <PaperProvider theme={paperTheme}>
      <LanguageProvider initialLanguage="en">
        <MemoryMatchSetupScreen onStart={onStart} />
      </LanguageProvider>
    </PaperProvider>
  );
}

describe('MemoryMatchSetupScreen', () => {
  it('disables Start until both a mode and a difficulty are chosen (solo mode)', async () => {
    const { getByTestId } = await renderSetup();

    await fireEvent.press(getByTestId('memory-match-mode-solo'));
    expect(getByTestId('memory-match-start-game').props.accessibilityState?.disabled).toBe(true);

    await fireEvent.press(getByTestId('memory-match-difficulty-10'));
    expect(getByTestId('memory-match-start-game').props.accessibilityState?.disabled).toBe(false);
  });

  it('starts solo mode with no friendName once Start is pressed', async () => {
    const onStart = jest.fn();
    const { getByTestId } = await renderSetup(onStart);

    await fireEvent.press(getByTestId('memory-match-mode-solo'));
    await fireEvent.press(getByTestId('memory-match-difficulty-6'));
    await fireEvent.press(getByTestId('memory-match-start-game'));

    expect(onStart).toHaveBeenCalledWith('solo', 6, undefined);
  });

  it('shows a friend-name field only after Friend mode is picked, and requires a name before Start enables', async () => {
    const { getByTestId, queryByTestId } = await renderSetup();

    expect(queryByTestId('memory-match-friend-name-input')).toBeNull();

    await fireEvent.press(getByTestId('memory-match-mode-friend'));
    expect(getByTestId('memory-match-friend-name-input')).toBeTruthy();

    await fireEvent.press(getByTestId('memory-match-difficulty-14'));
    expect(getByTestId('memory-match-start-game').props.accessibilityState?.disabled).toBe(true);

    await fireEvent.changeText(getByTestId('memory-match-friend-name-input'), 'Alex');
    expect(getByTestId('memory-match-start-game').props.accessibilityState?.disabled).toBe(false);
  });

  it('starts friend mode with the trimmed friend name and chosen pair count', async () => {
    const onStart = jest.fn();
    const { getByTestId } = await renderSetup(onStart);

    await fireEvent.press(getByTestId('memory-match-mode-friend'));
    await fireEvent.changeText(getByTestId('memory-match-friend-name-input'), '  Alex  ');
    await fireEvent.press(getByTestId('memory-match-difficulty-18'));
    await fireEvent.press(getByTestId('memory-match-start-game'));

    expect(onStart).toHaveBeenCalledWith('friend', 18, 'Alex');
  });

  it('does not enable Start with only whitespace typed into the friend-name field', async () => {
    const { getByTestId } = await renderSetup();

    await fireEvent.press(getByTestId('memory-match-mode-friend'));
    await fireEvent.press(getByTestId('memory-match-difficulty-6'));
    await fireEvent.changeText(getByTestId('memory-match-friend-name-input'), '   ');

    expect(getByTestId('memory-match-start-game').props.accessibilityState?.disabled).toBe(true);
  });

  it('offers all four difficulty options', async () => {
    const { getByTestId } = await renderSetup();

    expect(getByTestId('memory-match-difficulty-6')).toBeTruthy();
    expect(getByTestId('memory-match-difficulty-10')).toBeTruthy();
    expect(getByTestId('memory-match-difficulty-14')).toBeTruthy();
    expect(getByTestId('memory-match-difficulty-18')).toBeTruthy();
  });

  it('guards against a rapid double-tap on Start, only calling onStart once', async () => {
    const onStart = jest.fn();
    const { getByTestId } = await renderSetup(onStart);

    await fireEvent.press(getByTestId('memory-match-mode-solo'));
    await fireEvent.press(getByTestId('memory-match-difficulty-6'));
    const startButton = getByTestId('memory-match-start-game');
    await fireEvent.press(startButton);
    await fireEvent.press(startButton);

    expect(onStart).toHaveBeenCalledTimes(1);
  });
});

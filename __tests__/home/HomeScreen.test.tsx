import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { HomeScreen } from '../../src/home/HomeScreen';
import { LanguageProvider } from '../../src/i18n/LanguageContext';

describe('HomeScreen', () => {
  it('shows the child name and all four feature cards', async () => {
    const onNavigate = jest.fn();
    const { getByText } = await render(
      <LanguageProvider initialLanguage="en">
        <HomeScreen childName="Sam" onNavigate={onNavigate} />
      </LanguageProvider>
    );

    expect(getByText('Sam')).toBeTruthy();

    await fireEvent.press(getByText('Coloring'));
    expect(onNavigate).toHaveBeenCalledWith('coloring');

    await fireEvent.press(getByText('Quiz'));
    expect(onNavigate).toHaveBeenCalledWith('quiz');

    await fireEvent.press(getByText('Photo Puzzle'));
    expect(onNavigate).toHaveBeenCalledWith('puzzle');

    await fireEvent.press(getByText('Videos'));
    expect(onNavigate).toHaveBeenCalledWith('video');
  });

  it('exposes the settings icon button to screen readers with an accessible name', async () => {
    const onNavigate = jest.fn();
    const { findByLabelText } = await render(
      <LanguageProvider initialLanguage="en">
        <HomeScreen childName="Sam" onNavigate={onNavigate} />
      </LanguageProvider>
    );

    const settingsButton = await findByLabelText('Settings');
    await fireEvent.press(settingsButton);
    expect(onNavigate).toHaveBeenCalledWith('settings');
  });
});

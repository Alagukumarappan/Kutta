import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { MusicSettingsSection } from '../../src/settings/MusicSettingsSection';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import { useMusic } from '../../src/music/MusicContext';

jest.mock('expo-document-picker');
jest.mock('../../src/music/MusicContext', () => ({
  useMusic: jest.fn(),
}));

function renderSection() {
  return render(
    <LanguageProvider initialLanguage="en">
      <MusicSettingsSection />
    </LanguageProvider>
  );
}

describe('MusicSettingsSection', () => {
  const toggleMuted = jest.fn();
  const setCustomTrackUri = jest.fn().mockResolvedValue(undefined);
  const useDefaultTrack = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (useMusic as jest.Mock).mockReturnValue({
      muted: false,
      customTrackUri: null,
      toggleMuted,
      setCustomTrackUri,
      useDefaultTrack,
    });
  });

  it('shows the volume icon when unmuted and the mute icon when muted', async () => {
    const { findByTestId, rerender } = await renderSection();

    const button = await findByTestId('music-mute-toggle');
    expect(button.props.accessibilityLabel).toBe('Mute music');

    (useMusic as jest.Mock).mockReturnValue({
      muted: true,
      customTrackUri: null,
      toggleMuted,
      setCustomTrackUri,
      useDefaultTrack,
    });
    await rerender(
      <LanguageProvider initialLanguage="en">
        <MusicSettingsSection />
      </LanguageProvider>
    );

    const mutedButton = await findByTestId('music-mute-toggle');
    expect(mutedButton.props.accessibilityLabel).toBe('Play music');
  });

  it('calls toggleMuted when the mute button is pressed', async () => {
    const { findByTestId } = await renderSection();
    await fireEvent.press(await findByTestId('music-mute-toggle'));
    expect(toggleMuted).toHaveBeenCalledTimes(1);
  });

  it('does not show "Use default music" when no custom track is set', async () => {
    const { queryByTestId } = await renderSection();
    expect(queryByTestId('music-use-default')).toBeNull();
  });

  it('shows and wires "Use default music" once a custom track is set', async () => {
    (useMusic as jest.Mock).mockReturnValue({
      muted: false,
      customTrackUri: 'file:///docs/kutta-music/song.mp3',
      toggleMuted,
      setCustomTrackUri,
      useDefaultTrack,
    });

    const { findByTestId } = await renderSection();
    await fireEvent.press(await findByTestId('music-use-default'));
    expect(useDefaultTrack).toHaveBeenCalledTimes(1);
  });

  it('opens the audio file picker and persists the picked track', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'content://picker/song.mp3', name: 'song.mp3' }],
    });

    const { findByTestId } = await renderSection();
    await fireEvent.press(await findByTestId('music-choose-button'));

    await waitFor(() =>
      expect(setCustomTrackUri).toHaveBeenCalledWith('content://picker/song.mp3', 'song.mp3')
    );
    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'audio/*', multiple: false })
    );
  });

  it('does nothing when the picker is cancelled', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: [] });

    const { findByTestId } = await renderSection();
    await fireEvent.press(await findByTestId('music-choose-button'));

    await waitFor(() => expect(DocumentPicker.getDocumentAsync).toHaveBeenCalled());
    expect(setCustomTrackUri).not.toHaveBeenCalled();
  });

  it('shows a translated error alert if the picker fails', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockRejectedValue(new Error('picker crashed'));

    const { findByTestId } = await renderSection();
    await fireEvent.press(await findByTestId('music-choose-button'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Couldn't use that music file — please try again."));
  });
});

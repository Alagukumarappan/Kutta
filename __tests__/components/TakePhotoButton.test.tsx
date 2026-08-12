import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import * as ImagePicker from 'expo-image-picker';
import { TakePhotoButton } from '../../src/components/TakePhotoButton';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import { addFileReferences, persistPickedFile } from '../../src/storage/fileReferenceStore';

jest.mock('expo-image-picker');
jest.mock('../../src/storage/fileReferenceStore', () => ({
  addFileReferences: jest.fn(),
  persistPickedFile: jest.fn(),
}));

function renderButton(onTaken = jest.fn()) {
  return render(
    <LanguageProvider initialLanguage="en">
      <TakePhotoButton onTaken={onTaken} />
    </LanguageProvider>
  );
}

describe('TakePhotoButton', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (persistPickedFile as jest.Mock).mockImplementation((uri: string) => Promise.resolve(`file:///docs/kutta-added/copied-${uri}`));
    (addFileReferences as jest.Mock).mockResolvedValue([]);
  });

  it('requests camera permission, takes a photo, persists it durably, and adds a camera reference', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'file:///cache/photo123.jpg', fileName: 'photo123.jpg' }],
    });
    const onTaken = jest.fn();

    const { getByTestId } = await renderButton(onTaken);
    await fireEvent.press(getByTestId('take-photo-button'));

    await waitFor(() => expect(onTaken).toHaveBeenCalledTimes(1));
    expect(persistPickedFile).toHaveBeenCalledWith('file:///cache/photo123.jpg', 'photo123.jpg');
    expect(addFileReferences).toHaveBeenCalledWith('camera', ['file:///docs/kutta-added/copied-file:///cache/photo123.jpg']);
  });

  it('shows a translated error and does not open the camera when permission is denied', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: false });

    const { getByTestId } = await renderButton();
    await fireEvent.press(getByTestId('take-photo-button'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith(
      'Camera access is needed to take a photo — please allow it in your device settings.'
    ));
    expect(ImagePicker.launchCameraAsync).not.toHaveBeenCalled();
    expect(addFileReferences).not.toHaveBeenCalled();
  });

  it('shows a hint about the checkmark (not back) when the camera is cancelled', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchCameraAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
    const onTaken = jest.fn();

    const { getByTestId } = await renderButton(onTaken);
    await fireEvent.press(getByTestId('take-photo-button'));

    await waitFor(() =>
      expect(Alert.alert).toHaveBeenCalledWith(
        'No photo was saved. If you took a picture, tap the checkmark to confirm it before going back — the back button cancels it instead.'
      )
    );
    expect(onTaken).not.toHaveBeenCalled();
    expect(addFileReferences).not.toHaveBeenCalled();
  });

  it('shows a translated error alert if the camera fails', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    (ImagePicker.launchCameraAsync as jest.Mock).mockRejectedValue(new Error('camera crashed'));

    const { getByTestId } = await renderButton();
    await fireEvent.press(getByTestId('take-photo-button'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith("Couldn't take that photo — please try again."));
  });

  it('guards against a rapid double-tap, only opening the camera once', async () => {
    (ImagePicker.requestCameraPermissionsAsync as jest.Mock).mockResolvedValue({ granted: true });
    let resolveLaunch!: (value: unknown) => void;
    (ImagePicker.launchCameraAsync as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveLaunch = resolve;
      })
    );

    const { getByTestId } = await renderButton();
    const button = getByTestId('take-photo-button');

    await act(async () => {
      fireEvent.press(button);
      fireEvent.press(button);
    });

    expect(ImagePicker.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveLaunch({ canceled: true, assets: null });
      await Promise.resolve();
    });
  });
});

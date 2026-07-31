import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import { AddFilesButton } from '../../src/components/AddFilesButton';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import { getFileReferences } from '../../src/storage/fileReferenceStore';
import AsyncStorage from '@react-native-async-storage/async-storage';

jest.mock('expo-document-picker');
jest.mock('@react-native-async-storage/async-storage');

function renderButton(onAdded = jest.fn()) {
  return render(
    <LanguageProvider initialLanguage="en">
      <AddFilesButton
        testID="add-files"
        label="+ Add coloring picture"
        contentType="coloring"
        mimeType="image/*"
        onAdded={onAdded}
      />
    </LanguageProvider>
  );
}

describe('AddFilesButton', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('persists the picked files and calls onAdded when the picker returns a selection', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [
        { uri: 'content://tree/pic1.png', name: 'pic1.png', lastModified: 0 },
        { uri: 'content://tree/pic2.png', name: 'pic2.png', lastModified: 0 },
      ],
    });
    const onAdded = jest.fn();
    const { findByTestId } = await renderButton(onAdded);

    await fireEvent.press(await findByTestId('add-files'));

    await waitFor(() => expect(onAdded).toHaveBeenCalledTimes(1));
    const refs = await getFileReferences('coloring');
    expect(refs.map((r) => r.uri)).toEqual(['content://tree/pic1.png', 'content://tree/pic2.png']);
  });

  it('calls the picker with multi-select enabled and the given mime type', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
    const { findByTestId } = await renderButton();

    await fireEvent.press(await findByTestId('add-files'));

    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'image/*', multiple: true })
    );
  });

  it('does nothing and does not call onAdded when the picker is cancelled', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
    const onAdded = jest.fn();
    const { findByTestId } = await renderButton(onAdded);

    await fireEvent.press(await findByTestId('add-files'));

    expect(onAdded).not.toHaveBeenCalled();
    expect(await getFileReferences('coloring')).toEqual([]);
  });

  it('shows a friendly alert instead of crashing when the picker throws', async () => {
    (DocumentPicker.getDocumentAsync as jest.Mock).mockRejectedValue(new Error('boom'));
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const { findByTestId } = await renderButton();

    await fireEvent.press(await findByTestId('add-files'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
  });

  it('ignores a rapid second tap while the first pick is still in flight', async () => {
    let resolvePicker: (value: unknown) => void = () => {};
    (DocumentPicker.getDocumentAsync as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolvePicker = resolve;
      })
    );
    const { findByTestId } = await renderButton();
    const button = await findByTestId('add-files');

    // Not awaited: the picker's promise is deliberately left unresolved
    // here, so awaiting fireEvent.press's internal act() flush would hang
    // forever. Both taps are fired synchronously, then the picker resolves.
    fireEvent.press(button);
    fireEvent.press(button);
    await act(async () => {
      resolvePicker({ canceled: true, assets: null });
      await Promise.resolve();
    });

    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledTimes(1);
  });
});

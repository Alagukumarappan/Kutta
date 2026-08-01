import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ProfilePicturePicker } from '../../src/settings/ProfilePicturePicker';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';

jest.mock('expo-file-system/legacy', () => ({
  StorageAccessFramework: { readDirectoryAsync: jest.fn() },
}));
jest.mock('expo-document-picker');

describe('ProfilePicturePicker', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists images from the pictures folder and calls onSelect exactly once when a thumbnail is tapped', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
      'content://tree/pictures/beach.jpg',
      'content://tree/pictures/park.jpg',
    ]);

    const onSelect = jest.fn();
    const { findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <ProfilePicturePicker
          visible
          picturesFolderUri="content://tree/pictures"
          onSelect={onSelect}
          onClose={jest.fn()}
        />
      </LanguageProvider>
    );

    const item = await findByTestId('profile-picture-item-content://tree/pictures/beach.jpg');
    // Simulate a double-tap on the same thumbnail — the guard is a ref set
    // synchronously inside the very first onPress, so it blocks the second
    // tap regardless of whether React has re-rendered in between.
    await fireEvent.press(item);
    await fireEvent.press(item);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('content://tree/pictures/beach.jpg');
  });

  // Regression test for a real visual-consistency gap: the loading state
  // previously rendered a totally blank <View/> with no spinner, text, or
  // accessibility label — exactly the anti-pattern the shared LoadingPanel
  // was built to eliminate everywhere else (galleries, QuizScreen,
  // ColoringScreen), which this modal-based picker had been missed by.
  it('shows a real loading spinner (not a blank box) while the folder is still being read', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockImplementation(
      () => new Promise(() => {}) // never resolves — keeps this in the loading state
    );

    const { findByTestId, findByText } = await render(
      <LanguageProvider initialLanguage="en">
        <ProfilePicturePicker
          visible
          picturesFolderUri="content://tree/pictures"
          onSelect={jest.fn()}
          onClose={jest.fn()}
        />
      </LanguageProvider>
    );

    await findByTestId('profile-picture-picker-loading');
    // LoadingPanel's own ActivityIndicator has no reliable cross-platform
    // testID, so its message text is the simplest, most reliable signal
    // from outside that this is genuinely LoadingPanel and not a bare View.
    await findByText('Getting things ready...');
  });

  it('does not list the folder at all while not visible', () => {
    render(
      <LanguageProvider initialLanguage="en">
        <ProfilePicturePicker
          visible={false}
          picturesFolderUri="content://tree/pictures"
          onSelect={jest.fn()}
          onClose={jest.fn()}
        />
      </LanguageProvider>
    );

    expect(FileSystem.StorageAccessFramework.readDirectoryAsync).not.toHaveBeenCalled();
  });

  it('offers only "Browse anywhere" (no folder grid/loading/error states) when no picturesFolderUri is given, e.g. during onboarding', async () => {
    const { findByTestId, queryByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <ProfilePicturePicker visible={true} onSelect={jest.fn()} onClose={jest.fn()} />
      </LanguageProvider>
    );

    expect(FileSystem.StorageAccessFramework.readDirectoryAsync).not.toHaveBeenCalled();
    expect(queryByTestId('profile-picture-picker-loading')).toBeNull();
    expect(queryByTestId('profile-picture-picker-list')).toBeNull();
    await findByTestId('profile-picture-picker-browse-anywhere');
  });

  it('shows the empty state when the pictures folder has no images', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);

    const { findByText } = await render(
      <LanguageProvider initialLanguage="en">
        <ProfilePicturePicker
          visible
          picturesFolderUri="content://tree/pictures"
          onSelect={jest.fn()}
          onClose={jest.fn()}
        />
      </LanguageProvider>
    );

    await findByText('No pictures yet — add some to the pictures folder!');
  });

  it('shows a retry error state instead of a permanently blank modal when listing fails, e.g. a revoked SAF grant', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock)
      .mockRejectedValueOnce(new Error('SAF grant revoked'))
      .mockResolvedValueOnce(['content://tree/pictures/beach.jpg']);

    const { findByTestId, findByText, findByLabelText } = await render(
      <LanguageProvider initialLanguage="en">
        <ProfilePicturePicker
          visible
          picturesFolderUri="content://tree/pictures"
          onSelect={jest.fn()}
          onClose={jest.fn()}
        />
      </LanguageProvider>
    );

    await findByText('Something went wrong loading this content.');
    await findByLabelText('Retry');
    await fireEvent.press(await findByTestId('profile-picture-picker-retry'));

    await findByTestId('profile-picture-item-content://tree/pictures/beach.jpg');
  });

  it('calls onClose without calling onSelect when Cancel is tapped', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
      'content://tree/pictures/beach.jpg',
    ]);
    const onSelect = jest.fn();
    const onClose = jest.fn();

    const { findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <ProfilePicturePicker
          visible
          picturesFolderUri="content://tree/pictures"
          onSelect={onSelect}
          onClose={onClose}
        />
      </LanguageProvider>
    );

    await fireEvent.press(await findByTestId('profile-picture-picker-cancel'));
    expect(onClose).toHaveBeenCalled();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('labels each thumbnail for screen readers without exposing the raw filename', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
      'content://tree/pictures/birthday-party-with-grandma.jpg',
    ]);

    const { findByLabelText } = await render(
      <LanguageProvider initialLanguage="en">
        <ProfilePicturePicker
          visible
          picturesFolderUri="content://tree/pictures"
          onSelect={jest.fn()}
          onClose={jest.fn()}
        />
      </LanguageProvider>
    );

    // Labeled generically ("Choose a picture 1"), not by filename.
    await findByLabelText('Choose a picture 1');
  });

  it('re-lists the folder every time the modal is reopened', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
      'content://tree/pictures/beach.jpg',
    ]);

    const { rerender } = await render(
      <LanguageProvider initialLanguage="en">
        <ProfilePicturePicker
          visible={false}
          picturesFolderUri="content://tree/pictures"
          onSelect={jest.fn()}
          onClose={jest.fn()}
        />
      </LanguageProvider>
    );

    expect(FileSystem.StorageAccessFramework.readDirectoryAsync).not.toHaveBeenCalled();

    rerender(
      <LanguageProvider initialLanguage="en">
        <ProfilePicturePicker
          visible
          picturesFolderUri="content://tree/pictures"
          onSelect={jest.fn()}
          onClose={jest.fn()}
        />
      </LanguageProvider>
    );

    await waitFor(() => expect(FileSystem.StorageAccessFramework.readDirectoryAsync).toHaveBeenCalledTimes(1));
  });

  it('opens the system document picker in single-select image mode when "Browse anywhere" is tapped', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });

    const { findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <ProfilePicturePicker
          visible
          picturesFolderUri="content://tree/pictures"
          onSelect={jest.fn()}
          onClose={jest.fn()}
        />
      </LanguageProvider>
    );

    await fireEvent.press(await findByTestId('profile-picture-picker-browse-anywhere'));

    expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledWith({
      type: 'image/*',
      multiple: false,
      copyToCacheDirectory: false,
    });
  });

  it('calls onSelect with the picked uri when browsing anywhere succeeds', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
      canceled: false,
      assets: [{ uri: 'content://other-app/holiday.png', name: 'holiday.png', lastModified: 0 }],
    });
    const onSelect = jest.fn();

    const { findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <ProfilePicturePicker
          visible
          picturesFolderUri="content://tree/pictures"
          onSelect={onSelect}
          onClose={jest.fn()}
        />
      </LanguageProvider>
    );

    await fireEvent.press(await findByTestId('profile-picture-picker-browse-anywhere'));

    await waitFor(() => expect(onSelect).toHaveBeenCalledWith('content://other-app/holiday.png'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('does nothing when the "Browse anywhere" pick is cancelled', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: true, assets: null });
    const onSelect = jest.fn();
    const onClose = jest.fn();

    const { findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <ProfilePicturePicker
          visible
          picturesFolderUri="content://tree/pictures"
          onSelect={onSelect}
          onClose={onClose}
        />
      </LanguageProvider>
    );

    await fireEvent.press(await findByTestId('profile-picture-picker-browse-anywhere'));

    await waitFor(() => expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledTimes(1));
    expect(onSelect).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows a friendly alert instead of crashing when the document picker throws', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
    (DocumentPicker.getDocumentAsync as jest.Mock).mockRejectedValue(new Error('boom'));
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    const onSelect = jest.fn();

    const { findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <ProfilePicturePicker
          visible
          picturesFolderUri="content://tree/pictures"
          onSelect={onSelect}
          onClose={jest.fn()}
        />
      </LanguageProvider>
    );

    await fireEvent.press(await findByTestId('profile-picture-picker-browse-anywhere'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('lays the thumbnails out as a multi-column grid (a flexible share of the row), not a fixed-width single-column list', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
      'content://tree/pictures/beach.jpg',
      'content://tree/pictures/park.jpg',
      'content://tree/pictures/zoo.jpg',
    ]);
    const { StyleSheet } = require('react-native');

    const { findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <ProfilePicturePicker
          visible
          picturesFolderUri="content://tree/pictures"
          onSelect={jest.fn()}
          onClose={jest.fn()}
        />
      </LanguageProvider>
    );

    const item = await findByTestId('profile-picture-item-content://tree/pictures/beach.jpg');
    // The previous single-column layout gave each thumbnail a fixed
    // 100x100 px box; the new grid instead gives each thumbnail an equal
    // `flex: 1` share of its row (several per row, via the FlatList's
    // `numColumns`/`columnWrapperStyle`), so pinning `flex` here protects
    // the grid restyle from silently regressing back to one column.
    const style = StyleSheet.flatten(item.props.style);
    expect(style.flex).toBe(1);
  });

  it('gives "Browse anywhere" and "Cancel" a minimum touch target of 48dp', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
    const { StyleSheet } = require('react-native');

    const { findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <ProfilePicturePicker
          visible
          picturesFolderUri="content://tree/pictures"
          onSelect={jest.fn()}
          onClose={jest.fn()}
        />
      </LanguageProvider>
    );

    const browse = StyleSheet.flatten((await findByTestId('profile-picture-picker-browse-anywhere')).props.style);
    expect(browse.minHeight).toBeGreaterThanOrEqual(48);
    const cancel = StyleSheet.flatten((await findByTestId('profile-picture-picker-cancel')).props.style);
    expect(cancel.minHeight).toBeGreaterThanOrEqual(48);
  });

  it('ignores a rapid second tap on "Browse anywhere" while the first pick is still in flight', async () => {
    (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([]);
    let resolvePicker: (value: unknown) => void = () => {};
    (DocumentPicker.getDocumentAsync as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolvePicker = resolve;
      })
    );

    const { findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <ProfilePicturePicker
          visible
          picturesFolderUri="content://tree/pictures"
          onSelect={jest.fn()}
          onClose={jest.fn()}
        />
      </LanguageProvider>
    );
    const button = await findByTestId('profile-picture-picker-browse-anywhere');

    fireEvent.press(button);
    fireEvent.press(button);
    resolvePicker({ canceled: true, assets: null });
    await waitFor(() => expect(DocumentPicker.getDocumentAsync).toHaveBeenCalledTimes(1));
  });
});

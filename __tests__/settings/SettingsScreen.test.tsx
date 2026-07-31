import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { SettingsScreen } from '../../src/settings/SettingsScreen';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import * as profileStore from '../../src/storage/profileStore';
import * as folderAccess from '../../src/storage/folderAccess';
import * as folderMigration from '../../src/storage/folderMigration';
import * as FileSystem from 'expo-file-system/legacy';

jest.mock('../../src/storage/profileStore');
jest.mock('../../src/storage/folderAccess');
jest.mock('../../src/storage/folderMigration');
jest.mock('expo-file-system/legacy', () => ({
  StorageAccessFramework: { readDirectoryAsync: jest.fn() },
}));

const initialProfile = { name: 'Sam', age: 4, language: 'en' as const, rootFolderUri: 'content://tree/old' };

// Simulates the user tapping the "confirm" button of the migration Alert.
// Wrapped in `act` (and awaited) so the state updates handleSave makes once
// its awaited confirmMigration() promise resolves are properly flushed.
async function confirmAlertWith(buttonLabel: string) {
  const alertSpy = Alert.alert as jest.Mock;
  const [, , buttons] = alertSpy.mock.calls[alertSpy.mock.calls.length - 1];
  const button = buttons.find((b: { text: string }) => b.text === buttonLabel);
  await act(async () => {
    button.onPress();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    (profileStore.getProfile as jest.Mock).mockResolvedValue(initialProfile);
  });

  it('migrates content when the folder is changed and the user confirms, then saves the new profile', async () => {
    (folderAccess.requestFolderAccess as jest.Mock).mockResolvedValue('content://tree/new');
    (folderMigration.migrateContent as jest.Mock).mockResolvedValue({ success: true });
    (profileStore.saveProfile as jest.Mock).mockResolvedValue(undefined);

    const { getByText, findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <SettingsScreen />
      </LanguageProvider>
    );

    await findByTestId('settings-loaded');
    await fireEvent.press(getByText('Change content folder'));
    await waitFor(() => expect(folderAccess.requestFolderAccess).toHaveBeenCalled());
    // Not awaited: handleSave pauses mid-flight awaiting the confirmation
    // Alert's button press, so awaiting the event dispatch itself would hang.
    fireEvent.press(getByText('Save changes'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Move content?', expect.any(String), expect.any(Array), expect.any(Object)));
    expect(folderMigration.migrateContent).not.toHaveBeenCalled();

    await confirmAlertWith('Move content');

    await waitFor(() =>
      expect(folderMigration.migrateContent).toHaveBeenCalledWith('content://tree/old', 'content://tree/new')
    );
    await waitFor(() =>
      expect(profileStore.saveProfile).toHaveBeenCalledWith(
        expect.objectContaining({ rootFolderUri: 'content://tree/new' })
      )
    );
  });

  it('does NOT migrate or save the new folder if the user cancels the confirmation', async () => {
    (folderAccess.requestFolderAccess as jest.Mock).mockResolvedValue('content://tree/new');
    (folderMigration.migrateContent as jest.Mock).mockResolvedValue({ success: true });
    (profileStore.saveProfile as jest.Mock).mockResolvedValue(undefined);

    const { getByText, findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <SettingsScreen />
      </LanguageProvider>
    );

    await findByTestId('settings-loaded');
    await fireEvent.press(getByText('Change content folder'));
    await waitFor(() => expect(folderAccess.requestFolderAccess).toHaveBeenCalled());
    fireEvent.press(getByText('Save changes'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    await confirmAlertWith('Cancel');

    await waitFor(() => expect(profileStore.saveProfile).not.toHaveBeenCalled());
    expect(folderMigration.migrateContent).not.toHaveBeenCalled();
  });

  it('lets the user edit name and age and saves them without touching the folder or asking for confirmation', async () => {
    (profileStore.saveProfile as jest.Mock).mockResolvedValue(undefined);

    const { getByText, getByTestId, findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <SettingsScreen />
      </LanguageProvider>
    );

    await findByTestId('settings-loaded');
    await fireEvent.changeText(getByTestId('settings-name-input'), 'Samuel');
    await fireEvent.press(getByTestId('settings-age-picker'));
    await fireEvent.press(getByTestId('settings-age-option-5'));
    await fireEvent.press(getByTestId('settings-lang-de'));
    await fireEvent.press(getByText('Save changes'));

    await waitFor(() =>
      expect(profileStore.saveProfile).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Samuel', age: 5, language: 'de', rootFolderUri: 'content://tree/old' })
      )
    );
    expect(folderMigration.migrateContent).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('shows a failure message and keeps the old folder if migration fails', async () => {
    (folderAccess.requestFolderAccess as jest.Mock).mockResolvedValue('content://tree/new');
    (folderMigration.migrateContent as jest.Mock).mockResolvedValue({ success: false, error: 'disk full' });

    const { getByText, findByTestId, findByText } = await render(
      <LanguageProvider initialLanguage="en">
        <SettingsScreen />
      </LanguageProvider>
    );

    await findByTestId('settings-loaded');
    await fireEvent.press(getByText('Change content folder'));
    await waitFor(() => expect(folderAccess.requestFolderAccess).toHaveBeenCalled());
    fireEvent.press(getByText('Save changes'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    await confirmAlertWith('Move content');

    await findByText('Could not move content. Your old folder is unchanged.');
    expect(profileStore.saveProfile).not.toHaveBeenCalledWith(
      expect.objectContaining({ rootFolderUri: 'content://tree/new' })
    );
  });

  it('shows an error alert if picking a folder fails', async () => {
    (folderAccess.requestFolderAccess as jest.Mock).mockRejectedValue(new Error('picker unavailable'));

    const { getByText, findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <SettingsScreen />
      </LanguageProvider>
    );

    await findByTestId('settings-loaded');
    await fireEvent.press(getByText('Change content folder'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Error', 'picker unavailable'));
  });

  it('disables the Save button while a migration is in progress, preventing a double submit', async () => {
    (folderAccess.requestFolderAccess as jest.Mock).mockResolvedValue('content://tree/new');
    let resolveMigration!: (v: { success: true }) => void;
    (folderMigration.migrateContent as jest.Mock).mockImplementation(
      () => new Promise((resolve) => { resolveMigration = resolve; })
    );
    (profileStore.saveProfile as jest.Mock).mockResolvedValue(undefined);

    const { getByText, getByTestId, findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <SettingsScreen />
      </LanguageProvider>
    );

    await findByTestId('settings-loaded');
    await fireEvent.press(getByText('Change content folder'));
    await waitFor(() => expect(folderAccess.requestFolderAccess).toHaveBeenCalled());
    fireEvent.press(getByText('Save changes'));
    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    await confirmAlertWith('Move content');

    await waitFor(() => expect(folderMigration.migrateContent).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(getByTestId('settings-save').props.accessibilityState?.disabled).toBe(true));

    // A second tap while migrating must not trigger a second migration.
    fireEvent.press(getByTestId('settings-save'));
    expect(folderMigration.migrateContent).toHaveBeenCalledTimes(1);

    resolveMigration({ success: true });
    await waitFor(() => expect(profileStore.saveProfile).toHaveBeenCalled());
  });

  it('gives the language pills and folder-change button a vertical hitSlop to reach the ~44px touch-target guideline', async () => {
    const { getByTestId, findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <SettingsScreen />
      </LanguageProvider>
    );

    await findByTestId('settings-loaded');

    // Both pills render at roughly 39px tall (paddingVertical 8*2 + a
    // fontSize-16 line + borderWidth 4) — under the ~44px guideline. They
    // sit side-by-side with only an 8px horizontal gap between them, so
    // ONLY vertical hitSlop is safe here (horizontal hitSlop would risk
    // the two pills' hit zones overlapping); there's no interactive
    // sibling directly above/below either pill, so vertical hitSlop is
    // safe on that axis.
    for (const testID of ['settings-lang-en', 'settings-lang-de']) {
      const pill = getByTestId(testID);
      const hitSlop = pill.props.hitSlop ?? {};
      expect(hitSlop.top).toBeGreaterThanOrEqual(4);
      expect(hitSlop.bottom).toBeGreaterThanOrEqual(4);
    }

    // The folder-change button (~38px tall: paddingVertical 8*2 + a
    // fontSize-18 line) has no interactive sibling directly above/below it
    // either (only a non-interactive folder-path chip or label), so
    // vertical hitSlop is safe there too.
    const folderButton = getByTestId('settings-folder-picker');
    const folderHitSlop = folderButton.props.hitSlop ?? {};
    expect(folderHitSlop.top).toBeGreaterThanOrEqual(4);
    expect(folderHitSlop.bottom).toBeGreaterThanOrEqual(4);
  });

  describe('profile picture', () => {
    beforeEach(() => {
      (FileSystem.StorageAccessFramework.readDirectoryAsync as jest.Mock).mockResolvedValue([
        'content://tree/pictures/beach.jpg',
      ]);
    });

    it('does not show a "Choose a picture" button when no pictures folder is available', async () => {
      const { findByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <SettingsScreen />
        </LanguageProvider>
      );

      await findByTestId('settings-loaded');
      expect(queryByTestId('settings-picture-choose')).toBeNull();
      // No picture ever set -> the placeholder avatar shows, not a broken image.
      expect(await findByTestId('settings-picture-placeholder')).toBeTruthy();
    });

    it('lets the parent pick a picture from the pictures folder and stages it (not yet saved)', async () => {
      (profileStore.saveProfile as jest.Mock).mockResolvedValue(undefined);

      const { findByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <SettingsScreen picturesFolderUri="content://tree/pictures" />
        </LanguageProvider>
      );

      await findByTestId('settings-loaded');
      await fireEvent.press(await findByTestId('settings-picture-choose'));

      const item = await findByTestId('profile-picture-item-content://tree/pictures/beach.jpg');
      await fireEvent.press(item);

      // Picking closes the modal and shows the preview immediately...
      expect(queryByTestId('profile-picture-picker-list')).toBeNull();
      expect(await findByTestId('settings-picture-preview')).toBeTruthy();
      // ...but nothing is persisted until Save changes is pressed.
      expect(profileStore.saveProfile).not.toHaveBeenCalled();

      await fireEvent.press(await findByTestId('settings-save'));
      await waitFor(() =>
        expect(profileStore.saveProfile).toHaveBeenCalledWith(
          expect.objectContaining({ pictureUri: 'content://tree/pictures/beach.jpg' })
        )
      );
    });

    it('lets the parent remove a previously-set picture, reverting to the placeholder avatar', async () => {
      (profileStore.getProfile as jest.Mock).mockResolvedValue({
        ...initialProfile,
        pictureUri: 'content://tree/pictures/old.jpg',
      });
      (profileStore.saveProfile as jest.Mock).mockResolvedValue(undefined);

      const { findByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <SettingsScreen picturesFolderUri="content://tree/pictures" />
        </LanguageProvider>
      );

      await findByTestId('settings-loaded');
      expect(await findByTestId('settings-picture-preview')).toBeTruthy();

      await fireEvent.press(await findByTestId('settings-picture-remove'));
      expect(await findByTestId('settings-picture-placeholder')).toBeTruthy();
      expect(queryByTestId('settings-picture-preview')).toBeNull();

      await fireEvent.press(await findByTestId('settings-save'));
      // The saved *object* still carries an explicit `pictureUri: undefined`
      // key at this layer — profileStore.saveProfile's own JSON.stringify is
      // what actually drops it from persisted storage entirely (already
      // covered by __tests__/storage/profileStore.test.ts's dedicated
      // round-trip test), so the correct assertion here is just that the
      // value itself is gone, not that the key is structurally absent.
      await waitFor(() => {
        const saved = (profileStore.saveProfile as jest.Mock).mock.calls[0][0];
        expect(saved.pictureUri).toBeUndefined();
      });
    });

    it('falls back to the placeholder avatar instead of a broken image if the saved picture fails to load', async () => {
      (profileStore.getProfile as jest.Mock).mockResolvedValue({
        ...initialProfile,
        pictureUri: 'content://tree/pictures/missing.jpg',
      });

      const { findByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <SettingsScreen picturesFolderUri="content://tree/pictures" />
        </LanguageProvider>
      );

      const preview = await findByTestId('settings-picture-preview');
      await act(async () => {
        preview.props.onError();
      });

      expect(await findByTestId('settings-picture-placeholder')).toBeTruthy();
      expect(queryByTestId('settings-picture-preview')).toBeNull();
    });

    it('cancelling the picker leaves the previous picture untouched', async () => {
      (profileStore.getProfile as jest.Mock).mockResolvedValue({
        ...initialProfile,
        pictureUri: 'content://tree/pictures/old.jpg',
      });

      const { findByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <SettingsScreen picturesFolderUri="content://tree/pictures" />
        </LanguageProvider>
      );

      await findByTestId('settings-loaded');
      await fireEvent.press(await findByTestId('settings-picture-choose'));
      await findByTestId('profile-picture-picker-list');
      await fireEvent.press(await findByTestId('profile-picture-picker-cancel'));

      expect(queryByTestId('profile-picture-picker-list')).toBeNull();
      const preview = await findByTestId('settings-picture-preview');
      expect(preview.props.source).toEqual({ uri: 'content://tree/pictures/old.jpg' });
    });
  });
});

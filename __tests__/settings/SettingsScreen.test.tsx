import React from 'react';
import { Alert } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { SettingsScreen } from '../../src/settings/SettingsScreen';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import * as profileStore from '../../src/storage/profileStore';
import * as folderAccess from '../../src/storage/folderAccess';
import * as folderMigration from '../../src/storage/folderMigration';
import * as activityLogModule from '../../src/storage/activityLog';
import * as fileReferenceStore from '../../src/storage/fileReferenceStore';
import * as puzzleDifficultyStore from '../../src/storage/puzzleDifficultyStore';
import * as FileSystem from 'expo-file-system/legacy';
import { colors as dsColors } from '../../src/design-system';

jest.mock('../../src/storage/profileStore');
jest.mock('../../src/storage/folderAccess');
jest.mock('../../src/storage/folderMigration');
jest.mock('../../src/storage/activityLog');
jest.mock('../../src/storage/fileReferenceStore');
jest.mock('../../src/storage/puzzleDifficultyStore');
jest.mock('expo-file-system/legacy', () => ({
  StorageAccessFramework: { readDirectoryAsync: jest.fn(), deleteAsync: jest.fn() },
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
    // Default: no accomplishments yet, matching a brand-new profile — tests
    // specifically about the accomplishments display override this.
    (activityLogModule.getActivityLog as jest.Mock).mockResolvedValue({
      quizzesCompleted: 0,
      puzzlesCompleted: 0,
    });
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

  // Regression test for a real bug fix: handleSave previously built its
  // "nextProfile" to save from a SNAPSHOT of the name/age/language/picture
  // fields taken when Save was first pressed — a parent's edit made WHILE
  // the migration confirmation Alert (or the migration copy itself) was
  // still pending would be silently discarded the moment the in-flight
  // save's own setProfile(nextProfile) finally ran, overwriting the
  // parent's newer edit with the stale one.
  it('does not silently discard a name edit made while the migration confirmation is still pending', async () => {
    (folderAccess.requestFolderAccess as jest.Mock).mockResolvedValue('content://tree/new');
    (folderMigration.migrateContent as jest.Mock).mockResolvedValue({ success: true });
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
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Move content?', expect.any(String), expect.any(Array), expect.any(Object)));

    // Edit the name WHILE the confirmation Alert is still up — i.e. after
    // Save was first pressed, but before the parent has actually confirmed
    // the migration.
    await fireEvent.changeText(getByTestId('settings-name-input'), 'Samuel');

    await confirmAlertWith('Move content');

    await waitFor(() =>
      expect(profileStore.saveProfile).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Samuel', rootFolderUri: 'content://tree/new' })
      )
    );
  });

  // Regression test for a real issue caught during review of the fix
  // above: an earlier version of the fresh-value re-read ALSO re-blocked
  // Save on a blank name using the freshest value — but by the time that
  // check runs, a successful migration has already irreversibly happened
  // (migrateContent deletes the old folder's content once its copy is
  // verified). Aborting the save at that point would leave the profile
  // pointing at now-deleted content with no way back. The fix must still
  // persist the migration result even if the name went blank mid-flight,
  // falling back to the last-known-valid name rather than the blank one.
  it('still saves the migration result if the name is blanked mid-flight, falling back to the last valid name', async () => {
    (folderAccess.requestFolderAccess as jest.Mock).mockResolvedValue('content://tree/new');
    (folderMigration.migrateContent as jest.Mock).mockResolvedValue({ success: true });
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
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Move content?', expect.any(String), expect.any(Array), expect.any(Object)));

    // Blank the name WHILE the confirmation Alert is still up.
    await fireEvent.changeText(getByTestId('settings-name-input'), '');

    await confirmAlertWith('Move content');

    await waitFor(() =>
      expect(profileStore.saveProfile).toHaveBeenCalledWith(
        expect.objectContaining({ name: initialProfile.name, rootFolderUri: 'content://tree/new' })
      )
    );
  });

  // Confirms the name-blank fallback above is scoped to JUST the name field
  // — an age edit made in that same mid-flight window must still be
  // honored, not accidentally reverted alongside the name.
  it('still honors a fresh age edit even when the name fallback kicks in in the same save', async () => {
    (folderAccess.requestFolderAccess as jest.Mock).mockResolvedValue('content://tree/new');
    (folderMigration.migrateContent as jest.Mock).mockResolvedValue({ success: true });
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
    await waitFor(() => expect(Alert.alert).toHaveBeenCalledWith('Move content?', expect.any(String), expect.any(Array), expect.any(Object)));

    // Blank the name AND change the age, both while the confirmation Alert
    // is still up.
    await fireEvent.changeText(getByTestId('settings-name-input'), '');
    await fireEvent.press(getByTestId('settings-age-picker'));
    await fireEvent.press(getByTestId('settings-age-option-6'));

    await confirmAlertWith('Move content');

    await waitFor(() =>
      expect(profileStore.saveProfile).toHaveBeenCalledWith(
        expect.objectContaining({ name: initialProfile.name, age: 6, rootFolderUri: 'content://tree/new' })
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
    await fireEvent.press(getByTestId('settings-lang-picker'));
    await fireEvent.press(getByTestId('settings-lang-option-de'));
    await fireEvent.press(getByText('Save changes'));

    await waitFor(() =>
      expect(profileStore.saveProfile).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Samuel', age: 5, language: 'de', rootFolderUri: 'content://tree/old' })
      )
    );
    expect(folderMigration.migrateContent).not.toHaveBeenCalled();
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  // Regression test for a real bug fix: unlike OnboardingScreen (which
  // disables Save entirely until the name is non-blank), SettingsScreen had
  // no name validation at all — a parent clearing the name field and
  // hitting Save would silently persist an empty name, which would break
  // HomeScreen's "Hi, {name}" greeting and the profile-picture
  // initial-letter fallback (both assume a non-empty name).
  it('blocks Save and shows an error when the name is cleared to blank', async () => {
    const { getByText, getByTestId, findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <SettingsScreen />
      </LanguageProvider>
    );

    await findByTestId('settings-loaded');
    await fireEvent.changeText(getByTestId('settings-name-input'), '');
    await fireEvent.press(getByText('Save changes'));

    expect(Alert.alert).toHaveBeenCalledWith('Please enter a name');
    expect(profileStore.saveProfile).not.toHaveBeenCalled();
  });

  it('blocks Save when the name is whitespace-only, not just empty', async () => {
    const { getByText, getByTestId, findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <SettingsScreen />
      </LanguageProvider>
    );

    await findByTestId('settings-loaded');
    await fireEvent.changeText(getByTestId('settings-name-input'), '   ');
    await fireEvent.press(getByText('Save changes'));

    expect(Alert.alert).toHaveBeenCalledWith('Please enter a name');
    expect(profileStore.saveProfile).not.toHaveBeenCalled();
  });

  it('trims leading/trailing whitespace from the name before saving', async () => {
    (profileStore.saveProfile as jest.Mock).mockResolvedValue(undefined);

    const { getByText, getByTestId, findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <SettingsScreen />
      </LanguageProvider>
    );

    await findByTestId('settings-loaded');
    await fireEvent.changeText(getByTestId('settings-name-input'), '  Samuel  ');
    await fireEvent.press(getByText('Save changes'));

    await waitFor(() =>
      expect(profileStore.saveProfile).toHaveBeenCalledWith(expect.objectContaining({ name: 'Samuel' }))
    );
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

  // Regression test for a real bug fix: unlike OnboardingScreen's and
  // FolderErrorScreen's equivalent folder pickers (both already guarded),
  // handlePickFolder had no re-entrancy guard at all — a rapid double-tap
  // on "Change content folder" could fire two concurrent
  // requestFolderAccess() calls whose resolved uris could land out of
  // order.
  it('guards "Change content folder" against a rapid double-tap, only picking once', async () => {
    let resolveFolderPick!: (uri: string) => void;
    (folderAccess.requestFolderAccess as jest.Mock).mockImplementation(
      () => new Promise<string>((resolve) => { resolveFolderPick = resolve; })
    );

    const { getByText, findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <SettingsScreen />
      </LanguageProvider>
    );

    await findByTestId('settings-loaded');
    const changeFolderButton = getByText('Change content folder');
    // Two rapid presses on the SAME captured element before the mocked
    // picker promise ever resolves — same "stale double-tap" shape as this
    // codebase's other double-fire guard tests.
    await act(async () => {
      fireEvent.press(changeFolderButton);
      fireEvent.press(changeFolderButton);
    });

    expect(folderAccess.requestFolderAccess).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveFolderPick('content://tree/new-root');
      await Promise.resolve();
    });
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

  it('gives the language dropdown field and folder-change button a vertical hitSlop to reach the ~44px touch-target guideline', async () => {
    const { getByTestId, findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <SettingsScreen />
      </LanguageProvider>
    );

    await findByTestId('settings-loaded');

    const languageField = getByTestId('settings-lang-picker');
    const hitSlop = languageField.props.hitSlop ?? {};
    expect(hitSlop.top).toBeGreaterThanOrEqual(4);
    expect(hitSlop.bottom).toBeGreaterThanOrEqual(4);

    // The folder-change button (~38px tall: paddingVertical 8*2 + a
    // fontSize-18 line) has no interactive sibling directly above/below it
    // either (only a non-interactive folder-path chip or label), so
    // vertical hitSlop is safe there too.
    const folderButton = getByTestId('settings-folder-picker');
    const folderHitSlop = folderButton.props.hitSlop ?? {};
    expect(folderHitSlop.top).toBeGreaterThanOrEqual(4);
    expect(folderHitSlop.bottom).toBeGreaterThanOrEqual(4);
  });

  // Regression test for a real accessibility gap: unlike the rest of the
  // app's convention (every button in VideoGallery.tsx, AgePicker.tsx,
  // LanguageSelector.tsx explicitly sets both), this screen's own Pressables
  // previously had only a testID+style, with no accessibilityRole or
  // accessibilityLabel at all — a screen-reader user had no way to tell
  // what these controls were or that they were tappable.
  it('gives Save, Reset, and Change-folder an accessible role and label', async () => {
    const { getByTestId, findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <SettingsScreen />
      </LanguageProvider>
    );

    await findByTestId('settings-loaded');

    expect(getByTestId('settings-folder-picker').props.accessibilityRole).toBe('button');
    expect(getByTestId('settings-folder-picker').props.accessibilityLabel).toBe('Change content folder');
    expect(getByTestId('settings-save').props.accessibilityRole).toBe('button');
    expect(getByTestId('settings-save').props.accessibilityLabel).toBe('Save changes');
    expect(getByTestId('settings-reset').props.accessibilityRole).toBe('button');
    expect(getByTestId('settings-reset').props.accessibilityLabel).toBe('Reset everything');
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

    it('gives Choose-picture and Remove-picture an accessible role and label', async () => {
      (profileStore.getProfile as jest.Mock).mockResolvedValue({
        ...initialProfile,
        pictureUri: 'content://tree/pictures/old.jpg',
      });

      const { findByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <SettingsScreen picturesFolderUri="content://tree/pictures" />
        </LanguageProvider>
      );

      const chooseButton = await findByTestId('settings-picture-choose');
      expect(chooseButton.props.accessibilityRole).toBe('button');
      expect(chooseButton.props.accessibilityLabel).toBe('Choose a picture');

      const removeButton = await findByTestId('settings-picture-remove');
      expect(removeButton.props.accessibilityRole).toBe('button');
      expect(removeButton.props.accessibilityLabel).toBe('Remove picture');
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

  describe('save confirmation and navigate home', () => {
    it('shows a "Saved successfully" toast and then navigates home after a short delay', async () => {
      jest.useFakeTimers();
      (profileStore.saveProfile as jest.Mock).mockResolvedValue(undefined);
      const onGoHome = jest.fn();

      const { getByText, findByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <SettingsScreen onGoHome={onGoHome} />
        </LanguageProvider>
      );

      await findByTestId('settings-loaded');
      await act(async () => {
        fireEvent.press(getByText('Save changes'));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(await findByTestId('settings-saved-toast')).toBeTruthy();
      expect(onGoHome).not.toHaveBeenCalled();

      await act(async () => {
        jest.advanceTimersByTime(1200);
      });

      expect(onGoHome).toHaveBeenCalledTimes(1);
      expect(queryByTestId('settings-saved-toast')).toBeNull();
      jest.useRealTimers();
    });

    it('does not blow up when Save is pressed with no onGoHome handler provided', async () => {
      jest.useFakeTimers();
      (profileStore.saveProfile as jest.Mock).mockResolvedValue(undefined);

      const { getByText, findByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <SettingsScreen />
        </LanguageProvider>
      );

      await findByTestId('settings-loaded');
      await act(async () => {
        fireEvent.press(getByText('Save changes'));
        await Promise.resolve();
        await Promise.resolve();
      });

      expect(await findByTestId('settings-saved-toast')).toBeTruthy();

      await act(async () => {
        jest.advanceTimersByTime(1200);
      });
      jest.useRealTimers();
    });

    // Regression test for the premium-polish bug-hunt pass: the previous
    // `disabled={migrating}` guard on Save only ever engaged during a
    // folder migration — the common "just edited name/age" case had no
    // protection, so a rapid double-tap (trivial for a child) re-entered
    // handleSave a second time while the first call was still awaiting
    // saveProfile(), each scheduling its own onGoHome timer and eventually
    // navigating Home twice.
    it('guards Save against a rapid double-tap, saving and navigating home only once', async () => {
      jest.useFakeTimers();
      let resolveSave!: () => void;
      (profileStore.saveProfile as jest.Mock).mockImplementation(
        () => new Promise<void>((resolve) => { resolveSave = resolve; })
      );
      const onGoHome = jest.fn();

      const { getByText, findByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <SettingsScreen onGoHome={onGoHome} />
        </LanguageProvider>
      );

      await findByTestId('settings-loaded');
      const saveButton = getByText('Save changes');
      // Two rapid presses before saveProfile's promise ever resolves —
      // same "stale double-tap" shape as this codebase's other guard tests
      // (e.g. HomeScreen's per-card navLockRef test).
      await act(async () => {
        fireEvent.press(saveButton);
        fireEvent.press(saveButton);
      });

      expect(profileStore.saveProfile).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveSave();
        await Promise.resolve();
        await Promise.resolve();
      });
      await act(async () => {
        jest.advanceTimersByTime(1200);
      });

      expect(onGoHome).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
    });
  });

  describe('reset everything', () => {
    it('asks for confirmation, then deletes the Kutta-games folder, clears the profile, and calls onReset', async () => {
      (folderAccess.findChildUri as jest.Mock).mockResolvedValue('content://tree/old/Kutta-games');
      (FileSystem.StorageAccessFramework.deleteAsync as jest.Mock).mockResolvedValue(undefined);
      (profileStore.clearProfile as jest.Mock).mockResolvedValue(undefined);
      const onReset = jest.fn();

      const { getByText, getByTestId, findByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <SettingsScreen onReset={onReset} />
        </LanguageProvider>
      );

      await findByTestId('settings-loaded');
      await fireEvent.press(getByTestId('settings-reset'));

      await waitFor(() =>
        expect(Alert.alert).toHaveBeenCalledWith(
          'Reset everything?',
          expect.any(String),
          expect.any(Array),
          expect.any(Object)
        )
      );
      expect(profileStore.clearProfile).not.toHaveBeenCalled();

      await confirmAlertWith('Reset everything');

      await waitFor(() =>
        expect(FileSystem.StorageAccessFramework.deleteAsync).toHaveBeenCalledWith(
          'content://tree/old/Kutta-games',
          { idempotent: true }
        )
      );
      await waitFor(() => expect(profileStore.clearProfile).toHaveBeenCalled());
      expect(onReset).toHaveBeenCalledTimes(1);

      // Alert button label doubles as the destructive option here.
      expect(getByText('Reset everything')).toBeTruthy();
    });

    // Regression test for the quality-evolution gamification addition: a
    // reset should feel like a genuine fresh start, not leave an orphaned
    // accomplishment count behind for whichever child profile comes next.
    it('also clears the local activity log alongside the profile', async () => {
      (folderAccess.findChildUri as jest.Mock).mockResolvedValue(null);
      (profileStore.clearProfile as jest.Mock).mockResolvedValue(undefined);

      const { getByTestId, findByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <SettingsScreen onReset={jest.fn()} />
        </LanguageProvider>
      );

      await findByTestId('settings-loaded');
      await fireEvent.press(getByTestId('settings-reset'));
      await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
      await confirmAlertWith('Reset everything');

      await waitFor(() => expect(activityLogModule.clearActivityLog).toHaveBeenCalledTimes(1));
    });

    // Regression test for a real cross-profile data-leak bug fix: these two
    // stores are keyed globally, not scoped to any one profile — without
    // clearing them here, a fresh profile created after this reset would
    // silently inherit the PREVIOUS child's individually-added file
    // references and puzzle difficulty preference instead of a genuine
    // fresh start.
    it('also clears individually-added file references and the remembered puzzle difficulty', async () => {
      (folderAccess.findChildUri as jest.Mock).mockResolvedValue(null);
      (profileStore.clearProfile as jest.Mock).mockResolvedValue(undefined);

      const { getByTestId, findByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <SettingsScreen onReset={jest.fn()} />
        </LanguageProvider>
      );

      await findByTestId('settings-loaded');
      await fireEvent.press(getByTestId('settings-reset'));
      await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
      await confirmAlertWith('Reset everything');

      await waitFor(() => expect(fileReferenceStore.clearAllFileReferences).toHaveBeenCalledTimes(1));
      expect(puzzleDifficultyStore.clearPuzzleDifficulty).toHaveBeenCalledTimes(1);
    });

    it('does NOT reset anything if the parent cancels the confirmation', async () => {
      (folderAccess.findChildUri as jest.Mock).mockResolvedValue('content://tree/old/Kutta-games');
      const onReset = jest.fn();

      const { getByTestId, findByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <SettingsScreen onReset={onReset} />
        </LanguageProvider>
      );

      await findByTestId('settings-loaded');
      await fireEvent.press(getByTestId('settings-reset'));
      await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
      await confirmAlertWith('Cancel');

      expect(FileSystem.StorageAccessFramework.deleteAsync).not.toHaveBeenCalled();
      expect(profileStore.clearProfile).not.toHaveBeenCalled();
      expect(onReset).not.toHaveBeenCalled();
    });

    it('still clears the profile and calls onReset even if the content folder can no longer be found', async () => {
      (folderAccess.findChildUri as jest.Mock).mockResolvedValue(null);
      (profileStore.clearProfile as jest.Mock).mockResolvedValue(undefined);
      const onReset = jest.fn();

      const { getByTestId, findByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <SettingsScreen onReset={onReset} />
        </LanguageProvider>
      );

      await findByTestId('settings-loaded');
      await fireEvent.press(getByTestId('settings-reset'));
      await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
      await confirmAlertWith('Reset everything');

      expect(FileSystem.StorageAccessFramework.deleteAsync).not.toHaveBeenCalled();
      await waitFor(() => expect(profileStore.clearProfile).toHaveBeenCalled());
      expect(onReset).toHaveBeenCalledTimes(1);
    });
  });

  describe('landscape screen-fit', () => {
    // This screen stacks a title, two half-card rows, a profile-picture
    // card, and a save button inside a ScrollView on a landscape-locked
    // phone with only ~300-360dp of visible height. Font metrics can't be
    // measured in Jest, so this pins the compact spacing values directly
    // (rather than a pixel sum) to stop a future edit from silently
    // reintroducing the original large title/card margins that made this
    // screen require far more scrolling than intended.
    it('uses compact title and card spacing to minimize required scrolling', async () => {
      const { StyleSheet } = require('react-native');
      const { findByTestId, getByText } = await render(
        <LanguageProvider initialLanguage="en">
          <SettingsScreen />
        </LanguageProvider>
      );
      await findByTestId('settings-loaded');

      const title = StyleSheet.flatten(getByText('Settings').props.style);
      expect(title.fontSize).toBeLessThanOrEqual(24);
      expect(title.marginTop).toBeLessThanOrEqual(8);
      expect(title.marginBottom).toBeLessThanOrEqual(8);
    });
  });

  describe('calmer parent-facing redesign', () => {
    // This screen deliberately switched to the desaturated `colors.parent`
    // family (see src/design-system/tokens.ts) instead of the playful
    // bubblegum/violet/jade child-facing palette used elsewhere in this
    // redesign — pinning a couple of these choices stops a future edit from
    // silently reverting Settings back to a toy-colored look.
    it('renders the selected option in the language dropdown with the calmer parent accent color, not the child-facing palette', async () => {
      const { StyleSheet } = require('react-native');
      const { getByTestId, findByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <SettingsScreen />
        </LanguageProvider>
      );
      await findByTestId('settings-loaded');

      await fireEvent.press(getByTestId('settings-lang-picker'));

      const selected = StyleSheet.flatten(getByTestId('settings-lang-option-en').props.style);
      expect(selected.backgroundColor).toBe(dsColors.parent.accentSoft);
      expect(selected.backgroundColor).not.toBe(dsColors.violetSoft);

      const unselected = StyleSheet.flatten(getByTestId('settings-lang-option-de').props.style);
      expect(unselected.backgroundColor).not.toBe(dsColors.parent.accentSoft);
    });

    it('gives the enabled Save button a minimum touch target of 48dp', async () => {
      const { StyleSheet } = require('react-native');
      const { getByTestId, findByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <SettingsScreen />
        </LanguageProvider>
      );
      await findByTestId('settings-loaded');

      const save = StyleSheet.flatten(getByTestId('settings-save').props.style);
      expect(save.minHeight).toBeGreaterThanOrEqual(48);
    });

    it('gives the "Remove picture" button clear destructive styling using the shared error hue', async () => {
      (profileStore.getProfile as jest.Mock).mockResolvedValue({
        ...initialProfile,
        pictureUri: 'content://tree/pictures/old.jpg',
      });
      const { StyleSheet } = require('react-native');

      const { findByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <SettingsScreen picturesFolderUri="content://tree/pictures" />
        </LanguageProvider>
      );

      const removeButton = StyleSheet.flatten((await findByTestId('settings-picture-remove')).props.style);
      expect(removeButton.borderColor).toBe(dsColors.berry);
    });
  });

  describe('accomplishments summary', () => {
    it('is hidden entirely for a brand-new profile with nothing completed yet', async () => {
      (activityLogModule.getActivityLog as jest.Mock).mockResolvedValue({
        quizzesCompleted: 0,
        puzzlesCompleted: 0,
      });

      const { findByTestId, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <SettingsScreen />
        </LanguageProvider>
      );

      await findByTestId('settings-loaded');
      expect(queryByTestId('settings-accomplishments')).toBeNull();
    });

    it('shows completed quiz and puzzle counts once at least one activity has been completed', async () => {
      (activityLogModule.getActivityLog as jest.Mock).mockResolvedValue({
        quizzesCompleted: 3,
        puzzlesCompleted: 5,
      });

      const { findByTestId, getByText } = await render(
        <LanguageProvider initialLanguage="en">
          <SettingsScreen />
        </LanguageProvider>
      );

      await findByTestId('settings-accomplishments');
      expect(getByText(/3 quizzes completed/)).toBeTruthy();
      expect(getByText(/5 puzzles completed/)).toBeTruthy();
    });
  });
});

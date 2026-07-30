import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SettingsScreen } from '../../src/settings/SettingsScreen';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import * as profileStore from '../../src/storage/profileStore';
import * as folderAccess from '../../src/storage/folderAccess';
import * as folderMigration from '../../src/storage/folderMigration';

jest.mock('../../src/storage/profileStore');
jest.mock('../../src/storage/folderAccess');
jest.mock('../../src/storage/folderMigration');

const initialProfile = { name: 'Sam', age: 4, language: 'en' as const, rootFolderUri: 'content://tree/old' };

describe('SettingsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (profileStore.getProfile as jest.Mock).mockResolvedValue(initialProfile);
  });

  it('migrates content when the folder is changed and saves the new profile', async () => {
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
    await fireEvent.press(getByText('Save changes'));

    await waitFor(() =>
      expect(folderMigration.migrateContent).toHaveBeenCalledWith('content://tree/old', 'content://tree/new')
    );
    await waitFor(() =>
      expect(profileStore.saveProfile).toHaveBeenCalledWith(
        expect.objectContaining({ rootFolderUri: 'content://tree/new' })
      )
    );
  });

  it('lets the user edit name and age and saves them without touching the folder', async () => {
    (profileStore.saveProfile as jest.Mock).mockResolvedValue(undefined);

    const { getByText, getByTestId, findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <SettingsScreen />
      </LanguageProvider>
    );

    await findByTestId('settings-loaded');
    await fireEvent.changeText(getByTestId('settings-name-input'), 'Samuel');
    await fireEvent.changeText(getByTestId('settings-age-input'), '5');
    await fireEvent.press(getByTestId('settings-lang-de'));
    await fireEvent.press(getByText('Save changes'));

    await waitFor(() =>
      expect(profileStore.saveProfile).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Samuel', age: 5, language: 'de', rootFolderUri: 'content://tree/old' })
      )
    );
    expect(folderMigration.migrateContent).not.toHaveBeenCalled();
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
    await fireEvent.press(getByText('Save changes'));

    await findByText('Could not move content. Your old folder is unchanged.');
    expect(profileStore.saveProfile).not.toHaveBeenCalledWith(
      expect.objectContaining({ rootFolderUri: 'content://tree/new' })
    );
  });
});

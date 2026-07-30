import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { OnboardingScreen } from '../../src/onboarding/OnboardingScreen';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import * as folderAccess from '../../src/storage/folderAccess';
import * as profileStore from '../../src/storage/profileStore';

jest.mock('../../src/storage/folderAccess');
jest.mock('../../src/storage/profileStore');

describe('OnboardingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('saves the profile and calls onComplete after a successful folder pick', async () => {
    (folderAccess.requestFolderAccess as jest.Mock).mockResolvedValue('content://tree/root');
    (folderAccess.ensureContentStructure as jest.Mock).mockResolvedValue(undefined);
    (profileStore.saveProfile as jest.Mock).mockResolvedValue(undefined);

    const onComplete = jest.fn();
    const { getByTestId, getByText } = await render(
      <LanguageProvider initialLanguage="en">
        <OnboardingScreen onComplete={onComplete} />
      </LanguageProvider>
    );

    await fireEvent.changeText(getByTestId('onboarding-name-input'), 'Sam');
    await fireEvent.changeText(getByTestId('onboarding-age-input'), '4');
    await fireEvent.press(getByText('Choose content folder'));
    await waitFor(() => expect(folderAccess.requestFolderAccess).toHaveBeenCalled());
    await fireEvent.press(getByText('Save'));

    await waitFor(() => expect(profileStore.saveProfile).toHaveBeenCalledWith({
      name: 'Sam',
      age: 4,
      language: 'en',
      rootFolderUri: 'content://tree/root',
    }));
    expect(onComplete).toHaveBeenCalled();
  });

  it('does not save when age is out of range', async () => {
    (folderAccess.requestFolderAccess as jest.Mock).mockResolvedValue('content://tree/root');
    (folderAccess.ensureContentStructure as jest.Mock).mockResolvedValue(undefined);
    (profileStore.saveProfile as jest.Mock).mockResolvedValue(undefined);

    const onComplete = jest.fn();
    const { getByTestId, getByText } = await render(
      <LanguageProvider initialLanguage="en">
        <OnboardingScreen onComplete={onComplete} />
      </LanguageProvider>
    );

    await fireEvent.changeText(getByTestId('onboarding-name-input'), 'Sam');
    await fireEvent.changeText(getByTestId('onboarding-age-input'), '12');
    await fireEvent.press(getByText('Choose content folder'));
    await waitFor(() => expect(folderAccess.requestFolderAccess).toHaveBeenCalled());
    await fireEvent.press(getByText('Save'));

    expect(profileStore.saveProfile).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('does not save when no folder has been picked', async () => {
    (folderAccess.requestFolderAccess as jest.Mock).mockResolvedValue('content://tree/root');
    (folderAccess.ensureContentStructure as jest.Mock).mockResolvedValue(undefined);
    (profileStore.saveProfile as jest.Mock).mockResolvedValue(undefined);

    const onComplete = jest.fn();
    const { getByTestId, getByText } = await render(
      <LanguageProvider initialLanguage="en">
        <OnboardingScreen onComplete={onComplete} />
      </LanguageProvider>
    );

    await fireEvent.changeText(getByTestId('onboarding-name-input'), 'Sam');
    await fireEvent.changeText(getByTestId('onboarding-age-input'), '4');
    await fireEvent.press(getByText('Save'));

    expect(profileStore.saveProfile).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(folderAccess.requestFolderAccess).not.toHaveBeenCalled();
  });
});

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { OnboardingScreen } from '../../src/onboarding/OnboardingScreen';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import { paperTheme } from '../../src/design-system/paperTheme';
import * as folderAccess from '../../src/storage/folderAccess';
import * as profileStore from '../../src/storage/profileStore';
import * as DocumentPicker from 'expo-document-picker';

jest.mock('../../src/storage/folderAccess');
jest.mock('../../src/storage/profileStore');
jest.mock('expo-document-picker');

// The redesigned screen builds on the design-system's RaisedPrimaryButton
// (react-native-paper under the hood), which in the real app always renders
// inside App.tsx's top-level <PaperProvider theme={paperTheme}> — mirrored
// here (same pattern as __tests__/design-system/Buttons.test.tsx) so Paper's
// theme context is present exactly like production, not just its bare
// built-in default.
function renderScreen(onComplete: () => void = jest.fn(), language: 'en' | 'de' = 'en') {
  return render(
    <PaperProvider theme={paperTheme}>
      <LanguageProvider initialLanguage={language}>
        <OnboardingScreen onComplete={onComplete} />
      </LanguageProvider>
    </PaperProvider>
  );
}

async function selectAge(getByTestId: any, age: number) {
  await fireEvent.press(getByTestId('onboarding-age-picker'));
  await fireEvent.press(getByTestId(`onboarding-age-option-${age}`));
}

describe('OnboardingScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('saves the profile and calls onComplete after a successful folder pick', async () => {
    (folderAccess.requestFolderAccess as jest.Mock).mockResolvedValue('content://tree/root');
    (folderAccess.ensureContentStructure as jest.Mock).mockResolvedValue(undefined);
    (profileStore.saveProfile as jest.Mock).mockResolvedValue(undefined);

    const onComplete = jest.fn();
    const { getByTestId, getByText } = await renderScreen(onComplete);

    await fireEvent.changeText(getByTestId('onboarding-name-input'), 'Sam');
    await selectAge(getByTestId, 4);
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

  it('shows a "please wait" spinner overlay while first-time setup (folder + sample content) is in progress', async () => {
    (folderAccess.requestFolderAccess as jest.Mock).mockResolvedValue('content://tree/root');
    let resolveEnsure!: () => void;
    (folderAccess.ensureContentStructure as jest.Mock).mockImplementation(
      () => new Promise<void>((resolve) => { resolveEnsure = resolve; })
    );
    (profileStore.saveProfile as jest.Mock).mockResolvedValue(undefined);

    const { getByTestId, getByText, queryByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('onboarding-name-input'), 'Sam');
    await selectAge(getByTestId, 4);
    await fireEvent.press(getByText('Choose content folder'));
    await waitFor(() => expect(folderAccess.requestFolderAccess).toHaveBeenCalled());

    expect(queryByTestId('onboarding-saving-overlay')).toBeNull();
    fireEvent.press(getByText('Save'));

    expect(await waitFor(() => getByTestId('onboarding-saving-overlay'))).toBeTruthy();
    expect(getByText(/please wait/i)).toBeTruthy();

    resolveEnsure();
    await waitFor(() => expect(queryByTestId('onboarding-saving-overlay')).toBeNull());
  });

  it('does not save when age has not been selected', async () => {
    (folderAccess.requestFolderAccess as jest.Mock).mockResolvedValue('content://tree/root');
    (folderAccess.ensureContentStructure as jest.Mock).mockResolvedValue(undefined);
    (profileStore.saveProfile as jest.Mock).mockResolvedValue(undefined);

    const onComplete = jest.fn();
    const { getByTestId, getByText } = await renderScreen(onComplete);

    await fireEvent.changeText(getByTestId('onboarding-name-input'), 'Sam');
    await fireEvent.press(getByText('Choose content folder'));
    await waitFor(() => expect(folderAccess.requestFolderAccess).toHaveBeenCalled());
    await fireEvent.press(getByText('Save'));

    expect(profileStore.saveProfile).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('only offers ages 2 through 8 in the age picker', async () => {
    const { getByTestId, queryByTestId } = await renderScreen(jest.fn());

    await fireEvent.press(getByTestId('onboarding-age-picker'));

    for (let age = 2; age <= 8; age++) {
      expect(getByTestId(`onboarding-age-option-${age}`)).toBeTruthy();
    }
    expect(queryByTestId('onboarding-age-option-1')).toBeNull();
    expect(queryByTestId('onboarding-age-option-9')).toBeNull();
  });

  it('does not save when no folder has been picked', async () => {
    (folderAccess.requestFolderAccess as jest.Mock).mockResolvedValue('content://tree/root');
    (folderAccess.ensureContentStructure as jest.Mock).mockResolvedValue(undefined);
    (profileStore.saveProfile as jest.Mock).mockResolvedValue(undefined);

    const onComplete = jest.fn();
    const { getByTestId, getByText } = await renderScreen(onComplete);

    await fireEvent.changeText(getByTestId('onboarding-name-input'), 'Sam');
    await selectAge(getByTestId, 4);
    await fireEvent.press(getByText('Save'));

    expect(profileStore.saveProfile).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    expect(folderAccess.requestFolderAccess).not.toHaveBeenCalled();
  });

  it('visually marks the Save button as disabled until the form is valid', async () => {
    (folderAccess.requestFolderAccess as jest.Mock).mockResolvedValue('content://tree/root');

    const onComplete = jest.fn();
    const { getByTestId, getByText } = await renderScreen(onComplete);

    const saveButton = getByTestId('onboarding-save-button');
    expect(saveButton.props.accessibilityState?.disabled).toBe(true);

    await fireEvent.changeText(getByTestId('onboarding-name-input'), 'Sam');
    await selectAge(getByTestId, 4);
    await fireEvent.press(getByText('Choose content folder'));
    await waitFor(() => expect(folderAccess.requestFolderAccess).toHaveBeenCalled());

    expect(getByTestId('onboarding-save-button').props.accessibilityState?.disabled).toBe(false);
  });

  it('shows and hides field-level validation messages as the form becomes valid', async () => {
    (folderAccess.requestFolderAccess as jest.Mock).mockResolvedValue('content://tree/root');

    const { getByTestId, queryByTestId } = await renderScreen(jest.fn());

    expect(getByTestId('onboarding-name-error')).toBeTruthy();
    expect(getByTestId('onboarding-age-error')).toBeTruthy();
    expect(getByTestId('onboarding-folder-error')).toBeTruthy();

    await fireEvent.changeText(getByTestId('onboarding-name-input'), 'Sam');
    expect(queryByTestId('onboarding-name-error')).toBeNull();

    await selectAge(getByTestId, 4);
    expect(queryByTestId('onboarding-age-error')).toBeNull();

    // Folder still not picked.
    expect(getByTestId('onboarding-folder-error')).toBeTruthy();

    await fireEvent.press(getByTestId('onboarding-name-input'));
    await fireEvent.changeText(getByTestId('onboarding-name-input'), '');
    expect(getByTestId('onboarding-name-error')).toBeTruthy();
  });

  it('displays a human-readable folder path derived from the granted SAF URI', async () => {
    (folderAccess.requestFolderAccess as jest.Mock).mockResolvedValue(
      'content://com.android.externalstorage.documents/tree/primary%3AKutta%2FContent'
    );

    const { getByTestId, getByText } = await renderScreen(jest.fn());

    await fireEvent.press(getByText('Choose content folder'));
    await waitFor(() => expect(folderAccess.requestFolderAccess).toHaveBeenCalled());

    const confirmText = getByTestId('onboarding-folder-picked');
    expect(confirmText.props.children).toContain('Internal storage');
    expect(confirmText.props.children).toContain('Kutta');
    expect(confirmText.props.children).toContain('Content');
    expect(confirmText.props.children).not.toBe('Folder selected ✓');
  });

  it('gives the language dropdown field and folder-picker button a vertical hitSlop to reach the ~44px touch-target guideline', async () => {
    // Same gap, and same fix, as SettingsScreen's identically-styled (but
    // separately-defined) language field and folder button, addressed for
    // OnboardingScreen too so the two nearly-identical screens don't drift
    // out of consistency with each other.
    const { getByTestId } = await renderScreen(jest.fn());

    const languageField = getByTestId('onboarding-lang-picker');
    const hitSlop = languageField.props.hitSlop ?? {};
    expect(hitSlop.top).toBeGreaterThanOrEqual(4);
    expect(hitSlop.bottom).toBeGreaterThanOrEqual(4);

    const folderButton = getByTestId('onboarding-folder-picker');
    const folderHitSlop = folderButton.props.hitSlop ?? {};
    expect(folderHitSlop.top).toBeGreaterThanOrEqual(4);
    expect(folderHitSlop.bottom).toBeGreaterThanOrEqual(4);
  });

  it('opens the language dropdown and switches the selected language', async () => {
    (folderAccess.requestFolderAccess as jest.Mock).mockResolvedValue('content://tree/root');
    (folderAccess.ensureContentStructure as jest.Mock).mockResolvedValue(undefined);
    (profileStore.saveProfile as jest.Mock).mockResolvedValue(undefined);

    const { getByTestId, getByText, queryByTestId } = await renderScreen(jest.fn());

    expect(getByText('English')).toBeTruthy();
    await fireEvent.press(getByTestId('onboarding-lang-picker'));
    await fireEvent.press(getByTestId('onboarding-lang-option-de'));

    expect(queryByTestId('onboarding-lang-option-de')).toBeNull();
    expect(getByText('Deutsch')).toBeTruthy();

    await fireEvent.changeText(getByTestId('onboarding-name-input'), 'Sam');
    await selectAge(getByTestId, 4);
    await fireEvent.press(getByTestId('onboarding-folder-picker'));
    await waitFor(() => expect(folderAccess.requestFolderAccess).toHaveBeenCalled());
    await fireEvent.press(getByTestId('onboarding-save-button'));

    await waitFor(() =>
      expect(profileStore.saveProfile).toHaveBeenCalledWith(
        expect.objectContaining({ language: 'de' })
      )
    );
  });

  it('shows a welcoming subtitle under the title in English', async () => {
    const { getByText } = await renderScreen(jest.fn(), 'en');
    expect(getByText("Let's set up your child's profile")).toBeTruthy();
  });

  it('shows a welcoming subtitle under the title in German', async () => {
    const { getByText } = await renderScreen(jest.fn(), 'de');
    expect(getByText('Richten wir das Profil deines Kindes ein')).toBeTruthy();
  });

  it('uses the design-system RaisedPrimaryButton for Save (spring press feedback wired up)', async () => {
    const { Animated } = require('react-native');
    const springSpy = jest.spyOn(Animated, 'spring');

    (folderAccess.requestFolderAccess as jest.Mock).mockResolvedValue('content://tree/root');
    const { getByTestId, getByText } = await renderScreen(jest.fn());

    // The button only wires up onPressIn/onPressOut once enabled (a disabled
    // Paper Button intentionally drops those handlers) — so the form must be
    // valid first, same setup as the "visually marks disabled" test above.
    await fireEvent.changeText(getByTestId('onboarding-name-input'), 'Sam');
    await selectAge(getByTestId, 4);
    await fireEvent.press(getByText('Choose content folder'));
    await waitFor(() => expect(folderAccess.requestFolderAccess).toHaveBeenCalled());

    const saveLabel = getByText('Save');
    await fireEvent(saveLabel, 'pressIn');
    await fireEvent(saveLabel, 'pressOut');

    expect(springSpy).toHaveBeenCalled();
    springSpy.mockRestore();
  });

  describe('landscape screen-fit', () => {
    // Same reasoning as SettingsScreen's screen-fit test: this screen stacks
    // a title and two half-card rows inside a ScrollView on a
    // landscape-locked phone with limited visible height. Pins the compact
    // title spacing so it can't silently regress to the original large
    // margins that made the first-run screen require excessive scrolling.
    it('uses compact title spacing to minimize required scrolling', async () => {
      const { StyleSheet } = require('react-native');
      const { getByText } = await renderScreen(jest.fn());

      const title = StyleSheet.flatten(getByText('Welcome!').props.style);
      expect(title.fontSize).toBeLessThanOrEqual(24);
      expect(title.marginTop).toBeLessThanOrEqual(8);
      expect(title.marginBottom).toBeLessThanOrEqual(8);
    });
  });

  describe('optional profile picture', () => {
    it('shows the name\'s initial letter as a placeholder when no picture is set', async () => {
      const { getByTestId, queryByTestId } = await renderScreen();

      await fireEvent.changeText(getByTestId('onboarding-name-input'), 'sam');

      expect(getByTestId('onboarding-picture-placeholder')).toHaveTextContent('S');
      expect(queryByTestId('onboarding-picture-preview')).toBeNull();
    });

    it('shows "?" as the placeholder before any name has been typed', async () => {
      const { getByTestId } = await renderScreen();
      expect(getByTestId('onboarding-picture-placeholder')).toHaveTextContent('?');
    });

    it('lets the parent pick a picture via "Browse anywhere" and shows a preview + remove link', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'content://picked/photo.jpg', name: 'photo.jpg', lastModified: 0 }],
      });

      const { getByTestId, findByTestId, queryByTestId } = await renderScreen();

      await fireEvent.press(getByTestId('onboarding-picture-picker'));
      await fireEvent.press(await findByTestId('profile-picture-picker-browse-anywhere'));

      const preview = await findByTestId('onboarding-picture-preview');
      expect(preview.props.source).toEqual({ uri: 'content://picked/photo.jpg' });
      expect(queryByTestId('onboarding-picture-placeholder')).toBeNull();
      await findByTestId('onboarding-picture-remove');
    });

    it('clears the picture when "Remove" is pressed, reverting to the initial-letter placeholder', async () => {
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'content://picked/photo.jpg', name: 'photo.jpg', lastModified: 0 }],
      });

      const { getByTestId, findByTestId, queryByTestId } = await renderScreen();
      await fireEvent.changeText(getByTestId('onboarding-name-input'), 'Max');
      await fireEvent.press(getByTestId('onboarding-picture-picker'));
      await fireEvent.press(await findByTestId('profile-picture-picker-browse-anywhere'));
      await findByTestId('onboarding-picture-preview');

      await fireEvent.press(await findByTestId('onboarding-picture-remove'));

      expect(queryByTestId('onboarding-picture-preview')).toBeNull();
      expect(getByTestId('onboarding-picture-placeholder')).toHaveTextContent('M');
    });

    it('includes the picked pictureUri when saving the profile', async () => {
      (folderAccess.requestFolderAccess as jest.Mock).mockResolvedValue('content://tree/root');
      (folderAccess.ensureContentStructure as jest.Mock).mockResolvedValue(undefined);
      (profileStore.saveProfile as jest.Mock).mockResolvedValue(undefined);
      (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({
        canceled: false,
        assets: [{ uri: 'content://picked/photo.jpg', name: 'photo.jpg', lastModified: 0 }],
      });

      const { getByTestId, getByText, findByTestId } = await renderScreen();

      await fireEvent.changeText(getByTestId('onboarding-name-input'), 'Sam');
      await selectAge(getByTestId, 4);
      await fireEvent.press(getByText('Choose content folder'));
      await waitFor(() => expect(folderAccess.requestFolderAccess).toHaveBeenCalled());
      await fireEvent.press(getByTestId('onboarding-picture-picker'));
      await fireEvent.press(await findByTestId('profile-picture-picker-browse-anywhere'));
      await findByTestId('onboarding-picture-preview');

      await fireEvent.press(getByText('Save'));

      await waitFor(() =>
        expect(profileStore.saveProfile).toHaveBeenCalledWith({
          name: 'Sam',
          age: 4,
          language: 'en',
          rootFolderUri: 'content://tree/root',
          pictureUri: 'content://picked/photo.jpg',
        })
      );
    });
  });
});

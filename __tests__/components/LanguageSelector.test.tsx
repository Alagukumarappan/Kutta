import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { LanguageSelector } from '../../src/components/LanguageSelector';
import { LanguageProvider } from '../../src/i18n/LanguageContext';

// A minimal controlled wrapper mirroring how OnboardingScreen/SettingsScreen
// actually drive this component (visible/onOpen/onClose as external state),
// so tests exercise the same open/select/close cycle real screens do.
// `uiLanguage` is the app's OWN display language (LanguageSelector now uses
// useLanguage() for its accessibility labels), independent of `value` —
// the language this control lets a parent CHANGE — since the two can differ
// (e.g. reading the modal-close label in German while the currently
// selected/target language is still English).
function Wrapper({ variant, uiLanguage = 'en' }: { variant: 'playful' | 'parent'; uiLanguage?: 'en' | 'de' }) {
  const [value, setValue] = React.useState<'en' | 'de'>('en');
  const [visible, setVisible] = React.useState(false);
  return (
    <LanguageProvider initialLanguage={uiLanguage}>
      <LanguageSelector
        value={value}
        onChange={setValue}
        visible={visible}
        onOpen={() => setVisible(true)}
        onClose={() => setVisible(false)}
        testIDPrefix="lang"
        variant={variant}
      />
    </LanguageProvider>
  );
}

describe('LanguageSelector', () => {
  it('shows the currently selected language label on the closed field', async () => {
    const { getByText } = await render(<Wrapper variant="playful" />);
    expect(getByText('English')).toBeTruthy();
  });

  it('opens a dropdown of every language option when the field is pressed', async () => {
    const { getByTestId, findByTestId } = await render(<Wrapper variant="playful" />);

    await fireEvent.press(getByTestId('lang-picker'));

    expect(await findByTestId('lang-option-en')).toBeTruthy();
    expect(await findByTestId('lang-option-de')).toBeTruthy();
  });

  it('selects a language and closes the dropdown', async () => {
    const { getByTestId, queryByTestId, getByText } = await render(<Wrapper variant="playful" />);

    await fireEvent.press(getByTestId('lang-picker'));
    await fireEvent.press(getByTestId('lang-option-de'));

    await waitFor(() => expect(queryByTestId('lang-option-de')).toBeNull());
    expect(getByText('Deutsch')).toBeTruthy();
  });

  it('re-selecting the already-current language still closes the dropdown without erroring', async () => {
    const { getByTestId, queryByTestId, getByText } = await render(<Wrapper variant="parent" />);

    await fireEvent.press(getByTestId('lang-picker'));
    await fireEvent.press(getByTestId('lang-option-en'));

    await waitFor(() => expect(queryByTestId('lang-option-en')).toBeNull());
    expect(getByText('English')).toBeTruthy();
  });

  // Regression tests for the premium-polish accessibility pass:
  // LanguageSelector mirrors AgePicker's exact shared-modal shape (same
  // directory, same Onboarding/Settings usage, same doc-comment claiming to
  // follow that pattern) but never got AgePicker's iteration-12 fix — the
  // modal-dismiss backdrop and both language options had no
  // accessibilityRole/Label/State at all.
  describe('accessibility', () => {
    it('gives every language option a button role, its display-name label, and marks only the current language as selected', async () => {
      const { getByTestId } = await render(<Wrapper variant="playful" />);
      await fireEvent.press(getByTestId('lang-picker'));

      const enOption = getByTestId('lang-option-en');
      expect(enOption.props.accessibilityRole).toBe('button');
      expect(enOption.props.accessibilityLabel).toBe('English');
      expect(enOption.props.accessibilityState).toEqual({ selected: true });

      const deOption = getByTestId('lang-option-de');
      expect(deOption.props.accessibilityRole).toBe('button');
      expect(deOption.props.accessibilityLabel).toBe('Deutsch');
      expect(deOption.props.accessibilityState).toEqual({ selected: false });
    });

    it('gives the modal-dismiss backdrop a button role and a real label instead of leaving it unlabeled', async () => {
      const { getByTestId } = await render(<Wrapper variant="playful" />);
      await fireEvent.press(getByTestId('lang-picker'));

      const overlay = getByTestId('lang-modal-overlay');
      expect(overlay.props.accessibilityRole).toBe('button');
      expect(overlay.props.accessibilityLabel).toBe('Close language picker');
    });

    it('translates the modal-close label into German (the language option labels themselves are always the same, by design)', async () => {
      const { getByTestId } = await render(<Wrapper variant="playful" uiLanguage="de" />);
      await fireEvent.press(getByTestId('lang-picker'));

      expect(getByTestId('lang-modal-overlay').props.accessibilityLabel).toBe('Sprachauswahl schließen');
      // "English"/"Deutsch" are each language's own name for itself, not
      // translated strings — this stays true regardless of the app's
      // current display language.
      expect(getByTestId('lang-option-de').props.accessibilityLabel).toBe('Deutsch');
    });
  });
});

import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { LanguageSelector } from '../../src/components/LanguageSelector';

// A minimal controlled wrapper mirroring how OnboardingScreen/SettingsScreen
// actually drive this component (visible/onOpen/onClose as external state),
// so tests exercise the same open/select/close cycle real screens do.
function Wrapper({ variant }: { variant: 'playful' | 'parent' }) {
  const [value, setValue] = React.useState<'en' | 'de'>('en');
  const [visible, setVisible] = React.useState(false);
  return (
    <LanguageSelector
      value={value}
      onChange={setValue}
      visible={visible}
      onOpen={() => setVisible(true)}
      onClose={() => setVisible(false)}
      testIDPrefix="lang"
      variant={variant}
    />
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
});

import React from 'react';
import { Text } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { LanguageProvider, useLanguage } from '../../src/i18n/LanguageContext';

function Probe() {
  const { t } = useLanguage();
  return <Text testID="probe">{t('homeColoring')}</Text>;
}

describe('LanguageProvider', () => {
  it('uses the initial language', async () => {
    const { getByTestId } = await render(
      <LanguageProvider initialLanguage="de">
        <Probe />
      </LanguageProvider>
    );
    expect(getByTestId('probe')).toHaveTextContent('Malen');
  });

  // Regression: RootNavigator renders a LanguageProvider at the same tree
  // position for both the splash (no profile loaded yet -> "en") and the
  // real app (the profile's own language). React updates that provider in
  // place rather than remounting it, so a `useState(initialLanguage)` that
  // never re-derived from the prop left every German profile stuck in
  // English for the whole session.
  it('re-derives the language when initialLanguage changes', async () => {
    const { getByTestId, rerender } = await render(
      <LanguageProvider initialLanguage="en">
        <Probe />
      </LanguageProvider>
    );
    expect(getByTestId('probe')).toHaveTextContent('Coloring');

    await rerender(
      <LanguageProvider initialLanguage="de">
        <Probe />
      </LanguageProvider>
    );
    expect(getByTestId('probe')).toHaveTextContent('Malen');
  });

  it('keeps a setLanguage() choice when initialLanguage is unchanged', async () => {
    function Switcher() {
      const { t, setLanguage } = useLanguage();
      return (
        <Text testID="switcher" onPress={() => setLanguage('de')}>
          {t('homeColoring')}
        </Text>
      );
    }
    const { getByTestId, rerender } = await render(
      <LanguageProvider initialLanguage="en">
        <Switcher />
      </LanguageProvider>
    );
    await fireEvent.press(getByTestId('switcher'));
    expect(getByTestId('switcher')).toHaveTextContent('Malen');

    await rerender(
      <LanguageProvider initialLanguage="en">
        <Switcher />
      </LanguageProvider>
    );
    expect(getByTestId('switcher')).toHaveTextContent('Malen');
  });
});

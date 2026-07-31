import React from 'react';
import { render } from '@testing-library/react-native';
import { SplashScreen } from '../../src/splash/SplashScreen';
import { LanguageProvider } from '../../src/i18n/LanguageContext';

// This screen previously had no dedicated test file at all. It briefly
// showed the app's mascot emoji + a plain "Kutta" text title; now it shows
// the real Kutta.png wordmark logo image, so this pins down that the logo
// actually renders (with an accessibility label, since decorative emoji
// text no longer carries that meaning) and that the tagline is localized.
describe('SplashScreen', () => {
  it('renders the Kutta logo image with an accessibility label', async () => {
    const { findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <SplashScreen />
      </LanguageProvider>
    );

    const logo = await findByTestId('splash-logo');
    expect(logo.props.accessibilityLabel).toBe('Kutta');
    expect(logo.props.resizeMode).toBe('contain');
  });

  it('shows the localized tagline in English and German', async () => {
    const { findByText: findByTextEn } = await render(
      <LanguageProvider initialLanguage="en">
        <SplashScreen />
      </LanguageProvider>
    );
    await findByTextEn('Kutta — where learning likes play');

    const { findByText: findByTextDe } = await render(
      <LanguageProvider initialLanguage="de">
        <SplashScreen />
      </LanguageProvider>
    );
    await findByTextDe('Kutta — wo Lernen Spaß macht');
  });
});

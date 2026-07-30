import { t, UI_STRINGS } from '../../src/i18n/strings';

describe('strings', () => {
  it('has both en and de for every key', () => {
    for (const key of Object.keys(UI_STRINGS) as (keyof typeof UI_STRINGS)[]) {
      expect(UI_STRINGS[key].en).toEqual(expect.any(String));
      expect(UI_STRINGS[key].de).toEqual(expect.any(String));
      expect(UI_STRINGS[key].en.length).toBeGreaterThan(0);
      expect(UI_STRINGS[key].de.length).toBeGreaterThan(0);
    }
  });

  it('t() returns the string for the requested language', () => {
    expect(t('homeColoring', 'en')).toBe('Coloring');
    expect(t('homeColoring', 'de')).toBe('Malen');
  });
});

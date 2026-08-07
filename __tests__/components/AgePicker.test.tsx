import React from 'react';
import { StyleSheet } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { AgePicker } from '../../src/components/AgePicker';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import * as dsTokens from '../../src/design-system/tokens';

// AgePicker previously had no dedicated test file of its own (only indirect
// coverage via OnboardingScreen.test.tsx / SettingsScreen.test.tsx, which
// exercise its onOpen/onChange wiring but never its touch-target sizing).
// This file adds that missing direct coverage, focused specifically on the
// touch-target-sizing gap flagged (but left unmeasured) since iteration 16.
function renderPicker(
  props: Partial<React.ComponentProps<typeof AgePicker>> = {},
  language: 'en' | 'de' = 'en'
) {
  return render(
    <LanguageProvider initialLanguage={language}>
      <AgePicker
        value={null}
        onChange={jest.fn()}
        visible={true}
        onOpen={jest.fn()}
        onClose={jest.fn()}
        placeholder="Select age"
        testIDPrefix="test-age"
        {...props}
      />
    </LanguageProvider>
  );
}

describe('AgePicker touch targets', () => {
  it('gives the closed field a hitSlop that brings its effective tap area to at least 48 logical pixels', async () => {
    // The field's own box (paddingVertical: spacing.sm = 8 top + 8 bottom,
    // around an ~fontSize-22 line of text) renders at roughly 42px tall —
    // under the ~48px touch-target guideline. Since the field is a single,
    // isolated Pressable (no sibling directly above/below it inside the
    // same card with zero gap), hitSlop is a safe way to close that gap
    // without any visible layout change.
    const { getByTestId } = await renderPicker();
    const field = getByTestId('test-age-picker');
    const hitSlop = field.props.hitSlop;
    expect(hitSlop).toBeDefined();
    expect(hitSlop.top).toBeGreaterThanOrEqual(3);
    expect(hitSlop.bottom).toBeGreaterThanOrEqual(3);
    expect(hitSlop.left).toBeGreaterThanOrEqual(3);
    expect(hitSlop.right).toBeGreaterThanOrEqual(3);
  });

  it('gives each modal age option a minHeight of at least 48 logical pixels', async () => {
    // Unlike the closed field, the 7 option rows inside the modal are
    // stacked directly on top of one another with no gap between them
    // (AgePicker's modalCard sets no `gap`), so adding vertical hitSlop to
    // an optionRow would make neighboring rows' hit zones overlap —
    // exactly the mis-tap risk the sweep must avoid. A real minHeight is
    // the safe fix here instead: it grows the row itself rather than an
    // invisible-but-overlapping hit zone.
    const { getByTestId } = await renderPicker();
    const option4 = getByTestId('test-age-option-4');
    const flattenStyle = (style: any): Record<string, unknown> =>
      Array.isArray(style) ? Object.assign({}, ...style.map(flattenStyle)) : style || {};
    const style = flattenStyle(option4.props.style);
    expect(style.minHeight).toBeGreaterThanOrEqual(48);
  });
});

// Regression tests for the premium-polish accessibility pass: AgePicker had
// zero accessibility semantics anywhere (trigger, modal-dismiss overlay, and
// all 7 age options) — the same class of gap already fixed elsewhere (quiz
// options, puzzle pieces, tic-tac-toe cells), but on a component used in
// TWO first-run-critical screens (Onboarding and Settings).
describe('AgePicker accessibility', () => {
  it('gives the closed field a button role and a placeholder-based label when no age is chosen', async () => {
    const { getByTestId } = await renderPicker({ value: null });
    const field = getByTestId('test-age-picker');
    expect(field.props.accessibilityRole).toBe('button');
    expect(field.props.accessibilityLabel).toBe('Select age');
  });

  it("gives the closed field a value-based label once an age is chosen, instead of the placeholder", async () => {
    const { getByTestId } = await renderPicker({ value: 5 });
    const field = getByTestId('test-age-picker');
    expect(field.props.accessibilityLabel).toBe('5 years old');
  });

  it('gives every modal age option a button role, a distinct value label, and marks only the current age as selected', async () => {
    const { getByTestId } = await renderPicker({ value: 4 });
    for (const option of [2, 3, 4, 5, 6, 7, 8]) {
      const optionEl = getByTestId(`test-age-option-${option}`);
      expect(optionEl.props.accessibilityRole).toBe('button');
      expect(optionEl.props.accessibilityLabel).toBe(`${option} years old`);
      expect(optionEl.props.accessibilityState).toEqual({ selected: option === 4 });
    }
  });

  it('gives the modal-dismiss overlay a button role and a real label instead of leaving it unlabeled', async () => {
    const { getByTestId } = await renderPicker();
    const overlay = getByTestId('test-age-modal-overlay');
    expect(overlay.props.accessibilityRole).toBe('button');
    expect(overlay.props.accessibilityLabel).toBe('Close age picker');
  });

  it('translates the age option and modal-close labels into German', async () => {
    const { getByTestId } = await renderPicker({ value: 4 }, 'de');
    expect(getByTestId('test-age-option-4').props.accessibilityLabel).toBe('4 Jahre alt');
    expect(getByTestId('test-age-modal-overlay').props.accessibilityLabel).toBe('Altersauswahl schließen');
  });
});

// Token-drift regression: this shared component still styles its "default"
// variant (the one Settings renders) from the OLD `src/theme/tokens` palette,
// whose `disabledText` was chosen against that module's warm #FFF6E9
// background. Settings' cards are opaque white, where that color scores
// 3.71:1 — under the 4.5:1 WCAG AA floor for normal-weight 18px text, on the
// only visible label the control has before an age is picked.
describe('AgePicker placeholder contrast (default/Settings variant)', () => {
  function relativeLuminance(hex: string): number {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(1 + i, 3 + i), 16) / 255);
    const linearize = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const [rl, gl, bl] = [r, g, b].map(linearize);
    return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl;
  }
  function contrastRatio(hexA: string, hexB: string): number {
    const [lLight, lDark] = [relativeLuminance(hexA), relativeLuminance(hexB)].sort((a, b) => b - a);
    return (lLight + 0.05) / (lDark + 0.05);
  }

  it('clears 4.5:1 against the white parent-surface card it is rendered on', async () => {
    const { getByTestId } = await renderPicker();

    const label = getByTestId('test-age-picker').props.children;
    const style = StyleSheet.flatten(
      (Array.isArray(label) ? label[0] : label).props.style
    ) as { color: string; fontSize: number };

    expect(style.fontSize).toBe(18);
    expect(contrastRatio(style.color, dsTokens.colors.parent.surface)).toBeGreaterThanOrEqual(4.5);
  });
});

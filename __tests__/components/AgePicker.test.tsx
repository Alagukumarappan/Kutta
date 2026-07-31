import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { AgePicker } from '../../src/components/AgePicker';

// AgePicker previously had no dedicated test file of its own (only indirect
// coverage via OnboardingScreen.test.tsx / SettingsScreen.test.tsx, which
// exercise its onOpen/onChange wiring but never its touch-target sizing).
// This file adds that missing direct coverage, focused specifically on the
// touch-target-sizing gap flagged (but left unmeasured) since iteration 16.
function renderPicker(props: Partial<React.ComponentProps<typeof AgePicker>> = {}) {
  return render(
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

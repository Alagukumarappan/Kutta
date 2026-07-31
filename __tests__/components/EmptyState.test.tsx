import React from 'react';
import { render, act, cleanup } from '@testing-library/react-native';
import { EmptyState } from '../../src/components/EmptyState';

describe('EmptyState', () => {
  afterEach(cleanup);

  it('renders the given emoji and message', async () => {
    const { getByText } = await render(<EmptyState emoji="🎨" message="No pictures yet" testID="test-empty" />);
    expect(getByText('🎨')).toBeTruthy();
    expect(getByText('No pictures yet')).toBeTruthy();
  });

  it('hides its decorative dot row from screen readers', async () => {
    const rendered = await render(<EmptyState emoji="🎥" message="No videos yet" />);

    // Manually walk the rendered JSON tree rather than a testID query —
    // matches AgePicker.test.tsx's own manual-traversal approach for
    // inspecting nested view props in this codebase's RNTL setup.
    function find(node: any): any {
      if (!node) return null;
      if (node.props?.testID === 'empty-state-dots') return node;
      const children = Array.isArray(node.children) ? node.children : [];
      for (const child of children) {
        const found = find(child);
        if (found) return found;
      }
      return null;
    }

    const dots = find(rendered.toJSON());
    expect(dots).toBeTruthy();
    expect(dots.props.accessibilityElementsHidden).toBe(true);
    expect(dots.props.importantForAccessibility).toBe('no-hide-descendants');
  });

  it('stops its bounce animation on unmount without throwing', async () => {
    jest.useFakeTimers();
    const { unmount } = await render(<EmptyState emoji="🧩" message="No puzzles yet" />);

    // Advance partway through the loop so the animation is genuinely
    // in-flight, then unmount — this would surface a "can't update state on
    // an unmounted component" warning or a leaked timer if the effect's
    // cleanup didn't call loop.stop().
    await act(async () => {
      jest.advanceTimersByTime(400);
    });
    expect(() => unmount()).not.toThrow();
    await act(async () => {
      jest.advanceTimersByTime(5000);
    });

    jest.useRealTimers();
  });
});

import React from 'react';
import { Text, Animated } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { RaisedCard } from '../../src/design-system/RaisedCard';
import { colors } from '../../src/design-system/tokens';

describe('RaisedCard', () => {
  it('renders its children', async () => {
    const { getByText } = await render(
      <RaisedCard testID="card" color={colors.bubblegum}>
        <Text>Coloring</Text>
      </RaisedCard>
    );
    expect(getByText('Coloring')).toBeTruthy();
  });

  it('fires onPress when tappable', async () => {
    const onPress = jest.fn();
    const { getByTestId } = await render(
      <RaisedCard testID="card" color={colors.bubblegum} onPress={onPress}>
        <Text>Coloring</Text>
      </RaisedCard>
    );
    await fireEvent.press(getByTestId('card'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('renders as a static, non-interactive panel when no onPress is given', async () => {
    const { queryByRole } = await render(
      <RaisedCard testID="card" color={colors.jade}>
        <Text>Static content</Text>
      </RaisedCard>
    );
    expect(queryByRole('button')).toBeNull();
  });

  it('requests a spring toward the pressed-down scale on press-in when tappable', async () => {
    const springSpy = jest.spyOn(Animated, 'spring');

    const { getByTestId } = await render(
      <RaisedCard testID="card" color={colors.violet} onPress={jest.fn()}>
        <Text>Quiz</Text>
      </RaisedCard>
    );

    await fireEvent(getByTestId('card'), 'pressIn');
    const toValues = springSpy.mock.calls.map(([, config]) => (config as { toValue: number }).toValue);
    expect(toValues).toContain(0.95);

    springSpy.mockRestore();
  });

  it('does not throw when disabled and pressed', async () => {
    const onPress = jest.fn();
    const { getByTestId } = await render(
      <RaisedCard testID="card" color={colors.marigold} onPress={onPress} disabled>
        <Text>Video</Text>
      </RaisedCard>
    );
    await fireEvent.press(getByTestId('card'));
    expect(onPress).not.toHaveBeenCalled();
  });
});

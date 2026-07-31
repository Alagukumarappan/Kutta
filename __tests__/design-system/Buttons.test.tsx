import React from 'react';
import { Animated } from 'react-native';
import { render, fireEvent } from '@testing-library/react-native';
import { PaperProvider } from 'react-native-paper';
import { RaisedPrimaryButton, RaisedSecondaryButton } from '../../src/design-system/Buttons';
import { paperTheme } from '../../src/design-system/paperTheme';

function withPaper(children: React.ReactNode) {
  return <PaperProvider theme={paperTheme}>{children}</PaperProvider>;
}

describe('RaisedPrimaryButton', () => {
  it('renders its label and fires onPress', async () => {
    const onPress = jest.fn();
    const { getByText } = await render(
      withPaper(<RaisedPrimaryButton testID="primary" label="Start" onPress={onPress} />)
    );

    expect(getByText('Start')).toBeTruthy();
    await fireEvent.press(getByText('Start'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });

  it('does not fire onPress when disabled', async () => {
    const onPress = jest.fn();
    const { getByText } = await render(
      withPaper(<RaisedPrimaryButton testID="primary" label="Start" onPress={onPress} disabled />)
    );

    await fireEvent.press(getByText('Start'));
    expect(onPress).not.toHaveBeenCalled();
  });

  it('requests a spring press animation on press-in/press-out', async () => {
    const springSpy = jest.spyOn(Animated, 'spring');

    const { getByText } = await render(
      withPaper(<RaisedPrimaryButton testID="primary" label="Start" onPress={jest.fn()} />)
    );

    const label = getByText('Start');
    await fireEvent(label, 'pressIn');
    await fireEvent(label, 'pressOut');

    const toValues = springSpy.mock.calls.map(([, config]) => (config as { toValue: number }).toValue);
    expect(toValues).toContain(0.95);
    expect(toValues).toContain(1);

    springSpy.mockRestore();
  });
});

describe('RaisedSecondaryButton', () => {
  it('renders its label and fires onPress', async () => {
    const onPress = jest.fn();
    const { getByText } = await render(
      withPaper(<RaisedSecondaryButton testID="secondary" label="Cancel" onPress={onPress} />)
    );

    expect(getByText('Cancel')).toBeTruthy();
    await fireEvent.press(getByText('Cancel'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});

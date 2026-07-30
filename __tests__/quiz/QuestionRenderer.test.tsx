import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { QuestionRenderer } from '../../src/quiz/QuestionRenderer';
import type { Question } from '../../src/types/quiz';

const imageQuestion: Question = {
  id: 'q1',
  category: 'image',
  minAge: 2,
  maxAge: 8,
  question: { image: 'content://tree/quiz/images/missing.png' },
  options: [
    { id: 'a', text: { en: '3', de: '3' } },
    { id: 'b', text: { en: '4', de: '4' } },
    { id: 'c', text: { en: '5', de: '5' } },
    { id: 'd', text: { en: '6', de: '6' } },
  ],
  correctOptionId: 'b',
};

describe('QuestionRenderer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('falls back to a placeholder when the question image fails to load', async () => {
    const { getByTestId, queryByTestId } = await render(
      <QuestionRenderer
        question={imageQuestion}
        language="en"
        selectedOptionId={null}
        onSelect={jest.fn()}
        onNext={jest.fn()}
      />
    );

    const image = getByTestId('question-image');
    await fireEvent(image, 'error');

    expect(queryByTestId('question-image')).toBeNull();
    expect(getByTestId('question-image-broken')).toBeTruthy();
  });

  it('calls onSelect (without showing feedback yet) when an option is first tapped', async () => {
    const onSelect = jest.fn();

    const { getByTestId, queryByTestId } = await render(
      <QuestionRenderer
        question={imageQuestion}
        language="en"
        selectedOptionId={null}
        onSelect={onSelect}
        onNext={jest.fn()}
      />
    );

    expect(queryByTestId('quiz-feedback')).toBeNull();
    await fireEvent.press(getByTestId('option-b'));
    expect(onSelect).toHaveBeenCalledWith('b');
  });

  it('shows "Correct!" feedback once selectedOptionId matches the correct option, and Next advances', async () => {
    const onNext = jest.fn();

    const { getByText, getByTestId } = await render(
      <QuestionRenderer
        question={imageQuestion}
        language="en"
        selectedOptionId="b"
        onSelect={jest.fn()}
        onNext={onNext}
      />
    );

    expect(getByText('Correct!')).toBeTruthy();
    await fireEvent.press(getByTestId('quiz-next'));
    expect(onNext).toHaveBeenCalled();
  });

  it('shows "Try again!" feedback when the selected option is wrong', async () => {
    const { getByText } = await render(
      <QuestionRenderer
        question={imageQuestion}
        language="en"
        selectedOptionId="a"
        onSelect={jest.fn()}
        onNext={jest.fn()}
      />
    );

    expect(getByText('Try again!')).toBeTruthy();
  });

  it('does not call onSelect again once an option has already been answered', async () => {
    const onSelect = jest.fn();

    const { getByTestId } = await render(
      <QuestionRenderer
        question={imageQuestion}
        language="en"
        selectedOptionId="a"
        onSelect={onSelect}
        onNext={jest.fn()}
      />
    );

    await fireEvent.press(getByTestId('option-c'));
    expect(onSelect).not.toHaveBeenCalled();
  });
});

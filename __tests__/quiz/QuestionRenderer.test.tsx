import React from 'react';
import { render, fireEvent, within } from '@testing-library/react-native';
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

// Reflects the current quiz content shape: every image-category question now
// combines an image AND text together, on both the question and every
// option (previously they were image-only or text-only).
const combinedQuestion: Question = {
  id: 'q2',
  category: 'image',
  minAge: 2,
  maxAge: 8,
  question: {
    image: 'content://tree/quiz/images/apple.png',
    text: { en: 'Which one is red?', de: 'Welches ist rot?' },
  },
  options: [
    { id: 'a', image: 'content://tree/quiz/images/apple.png', text: { en: 'Apple', de: 'Apfel' } },
    { id: 'b', image: 'content://tree/quiz/images/banana.png', text: { en: 'Banana', de: 'Banane' } },
    { id: 'c', image: 'content://tree/quiz/images/grape.png', text: { en: 'Grape', de: 'Traube' } },
    { id: 'd', image: 'content://tree/quiz/images/pear.png', text: { en: 'Pear', de: 'Birne' } },
  ],
  correctOptionId: 'a',
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

  it('renders BOTH the image and the text for the question and every option (combined content)', async () => {
    const { getByTestId, getByText } = await render(
      <QuestionRenderer
        question={combinedQuestion}
        language="en"
        selectedOptionId={null}
        onSelect={jest.fn()}
        onNext={jest.fn()}
      />
    );

    expect(getByTestId('question-image')).toBeTruthy();
    expect(getByText('Which one is red?')).toBeTruthy();

    for (const [id, label] of [
      ['a', 'Apple'],
      ['b', 'Banana'],
      ['c', 'Grape'],
      ['d', 'Pear'],
    ]) {
      expect(getByTestId(`option-image-${id}`)).toBeTruthy();
      expect(getByText(label)).toBeTruthy();
    }
  });

  it('lays out the 4 options as two explicit rows of two (not a single wrapping list)', async () => {
    const { getByTestId } = await render(
      <QuestionRenderer
        question={combinedQuestion}
        language="en"
        selectedOptionId={null}
        onSelect={jest.fn()}
        onNext={jest.fn()}
      />
    );

    const row0 = getByTestId('quiz-options-row-0');
    const row1 = getByTestId('quiz-options-row-1');
    expect(within(row0).getByTestId('option-a')).toBeTruthy();
    expect(within(row0).getByTestId('option-b')).toBeTruthy();
    expect(within(row1).getByTestId('option-c')).toBeTruthy();
    expect(within(row1).getByTestId('option-d')).toBeTruthy();
  });

  it('marks the correct option with a checkmark and the wrong tapped option with an X once answered', async () => {
    const { getByTestId } = await render(
      <QuestionRenderer
        question={combinedQuestion}
        language="en"
        selectedOptionId="b"
        onSelect={jest.fn()}
        onNext={jest.fn()}
      />
    );

    expect(getByTestId('option-mark-a')).toBeTruthy(); // correct option
    expect(getByTestId('option-mark-b')).toBeTruthy(); // wrongly selected option
  });
});

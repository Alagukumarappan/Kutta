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
    const onAnswer = jest.fn();

    const { getByTestId, queryByTestId } = await render(
      <QuestionRenderer question={imageQuestion} language="en" onAnswer={onAnswer} />
    );

    const image = getByTestId('question-image');
    await fireEvent(image, 'error');

    expect(queryByTestId('question-image')).toBeNull();
    expect(getByTestId('question-image-broken')).toBeTruthy();
  });
});

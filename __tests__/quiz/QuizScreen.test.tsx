import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { QuizScreen } from '../../src/quiz/QuizScreen';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import * as loadQuestionsModule from '../../src/quiz/loadQuestions';
import type { Question } from '../../src/types/quiz';

jest.mock('../../src/quiz/loadQuestions');

const twoQuestions: Question[] = [
  {
    id: 'q1',
    category: 'text',
    minAge: 2,
    maxAge: 8,
    question: { text: { en: '2 + 2?', de: '2 + 2?' } },
    options: [
      { id: 'a', text: { en: '3', de: '3' } },
      { id: 'b', text: { en: '4', de: '4' } },
      { id: 'c', text: { en: '5', de: '5' } },
      { id: 'd', text: { en: '6', de: '6' } },
    ],
    correctOptionId: 'b',
  },
  {
    id: 'q2',
    category: 'text',
    minAge: 2,
    maxAge: 8,
    question: { text: { en: '1 + 1?', de: '1 + 1?' } },
    options: [
      { id: 'a', text: { en: '2', de: '2' } },
      { id: 'b', text: { en: '3', de: '3' } },
      { id: 'c', text: { en: '4', de: '4' } },
      { id: 'd', text: { en: '5', de: '5' } },
    ],
    correctOptionId: 'a',
  },
];

describe('QuizScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows one question, then the next after answering, then the end card with the score', async () => {
    (loadQuestionsModule.loadQuestions as jest.Mock).mockResolvedValue(twoQuestions);
    // buildSession shuffles the session; pin Math.random so ordering is deterministic
    // (session stays in original array order) for this assertion.
    jest.spyOn(Math, 'random').mockReturnValue(0.999999);

    const { findByText, getByText, getByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <QuizScreen quizFolderUri="content://tree/quiz" childAge={5} />
      </LanguageProvider>
    );

    await findByText('2 + 2?');
    await fireEvent.press(getByText('4'));
    await findByText('Correct!');
    await fireEvent.press(getByTestId('quiz-next'));

    await findByText('1 + 1?');
    await fireEvent.press(getByText('2'));
    await findByText('Correct!');
    await fireEvent.press(getByTestId('quiz-next'));

    await waitFor(() => expect(getByText('Quiz done! Your score: 2 / 2')).toBeTruthy());
  });

  it('shows "Try again!" for a wrong answer but still advances and does not award a point', async () => {
    (loadQuestionsModule.loadQuestions as jest.Mock).mockResolvedValue(twoQuestions);
    jest.spyOn(Math, 'random').mockReturnValue(0.999999);

    const { findByText, getByText, getByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <QuizScreen quizFolderUri="content://tree/quiz" childAge={5} />
      </LanguageProvider>
    );

    await findByText('2 + 2?');
    await fireEvent.press(getByText('3')); // wrong answer
    await findByText('Try again!');
    await fireEvent.press(getByTestId('quiz-next'));

    await findByText('1 + 1?');
    await fireEvent.press(getByText('2'));
    await findByText('Correct!');
    await fireEvent.press(getByTestId('quiz-next'));

    await waitFor(() => expect(getByText('Quiz done! Your score: 1 / 2')).toBeTruthy());
  });

  it('shows the empty state when there are no eligible questions', async () => {
    (loadQuestionsModule.loadQuestions as jest.Mock).mockResolvedValue([]);

    const { findByText } = await render(
      <LanguageProvider initialLanguage="en">
        <QuizScreen quizFolderUri="content://tree/quiz" childAge={5} />
      </LanguageProvider>
    );

    await findByText('No quiz questions for this age yet.');
  });

  it('shows a retry error state instead of a permanently blank screen when loading fails', async () => {
    (loadQuestionsModule.loadQuestions as jest.Mock)
      .mockRejectedValueOnce(new Error('SAF grant revoked'))
      .mockResolvedValueOnce(twoQuestions);
    jest.spyOn(Math, 'random').mockReturnValue(0.999999);

    const { findByTestId, findByText } = await render(
      <LanguageProvider initialLanguage="en">
        <QuizScreen quizFolderUri="content://tree/quiz" childAge={5} />
      </LanguageProvider>
    );

    await findByText('Something went wrong loading this content.');
    await fireEvent.press(await findByTestId('quiz-retry'));

    await findByText('2 + 2?');
  });
});

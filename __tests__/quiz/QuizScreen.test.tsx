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

  it('shows age-appropriate encouragement for a wrong answer but still advances and does not award a point', async () => {
    (loadQuestionsModule.loadQuestions as jest.Mock).mockResolvedValue(twoQuestions);
    jest.spyOn(Math, 'random').mockReturnValue(0.999999);

    // childAge=5 is in the older (5-8) tier, so this exercises that wording.
    const { findByText, getByText, getByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <QuizScreen quizFolderUri="content://tree/quiz" childAge={5} />
      </LanguageProvider>
    );

    await findByText('2 + 2?');
    await fireEvent.press(getByText('3')); // wrong answer
    await findByText('Nice try! Take another look.');
    await fireEvent.press(getByTestId('quiz-next'));

    await findByText('1 + 1?');
    await fireEvent.press(getByText('2'));
    await findByText('Correct!');
    await fireEvent.press(getByTestId('quiz-next'));

    await waitFor(() => expect(getByText('Quiz done! Your score: 1 / 2')).toBeTruthy());
  });

  it('shows the younger-child (2-4) wrong-answer wording when the profile age is 2-4', async () => {
    (loadQuestionsModule.loadQuestions as jest.Mock).mockResolvedValue(twoQuestions);
    jest.spyOn(Math, 'random').mockReturnValue(0.999999);

    const { findByText, getByText } = await render(
      <LanguageProvider initialLanguage="en">
        <QuizScreen quizFolderUri="content://tree/quiz" childAge={3} />
      </LanguageProvider>
    );

    await findByText('2 + 2?');
    await fireEvent.press(getByText('3')); // wrong answer
    await findByText("Good try! Let's try again.");
  });

  it('"Try Again" re-enables answer selection and only scores the final pick once (no double-scoring)', async () => {
    (loadQuestionsModule.loadQuestions as jest.Mock).mockResolvedValue(twoQuestions);
    jest.spyOn(Math, 'random').mockReturnValue(0.999999);

    const { findByText, getByText, getByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <QuizScreen quizFolderUri="content://tree/quiz" childAge={5} />
      </LanguageProvider>
    );

    await findByText('2 + 2?');
    await fireEvent.press(getByText('3')); // wrong answer first
    await findByText('Nice try! Take another look.');

    // Retry: options re-enable, the wrong answer's feedback disappears, and
    // — critically — the correct answer must NOT have been revealed by the
    // retry wording/flow itself (it can still be visible via the pre-existing
    // on-option checkmark, which is a separate, already-established
    // mechanism this iteration doesn't touch).
    await fireEvent.press(getByTestId('quiz-retry-answer'));
    expect(() => getByText('Nice try! Take another look.')).toThrow();

    // Pick the correct answer on the retry and advance.
    await fireEvent.press(getByText('4'));
    await findByText('Correct!');
    await fireEvent.press(getByTestId('quiz-next'));

    await findByText('1 + 1?');
    await fireEvent.press(getByText('2'));
    await findByText('Correct!');
    await fireEvent.press(getByTestId('quiz-next'));

    // Only ONE point for question 1 (the retried correct pick), not zero
    // (the original wrong pick) and not two (double-scored) — 2/2 total.
    await waitFor(() => expect(getByText('Quiz done! Your score: 2 / 2')).toBeTruthy());
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

    const { findByTestId, findByText, findByLabelText } = await render(
      <LanguageProvider initialLanguage="en">
        <QuizScreen quizFolderUri="content://tree/quiz" childAge={5} />
      </LanguageProvider>
    );

    await findByText('Something went wrong loading this content.');
    // Screen-reader users need an accessible name for the retry button, not
    // just visible text — assert it's exposed as an accessibility label too.
    await findByLabelText('Retry');
    await fireEvent.press(await findByTestId('quiz-retry'));

    await findByText('2 + 2?');
  });

  describe('progress indicator wiring to real session state', () => {
    it('advances the progress label on Next but leaves it unchanged across a Try Again retry', async () => {
      (loadQuestionsModule.loadQuestions as jest.Mock).mockResolvedValue(twoQuestions);
      jest.spyOn(Math, 'random').mockReturnValue(0.999999);

      const { findByText, getByText, getByTestId, findByLabelText, queryByLabelText } = await render(
        <LanguageProvider initialLanguage="en">
          <QuizScreen quizFolderUri="content://tree/quiz" childAge={5} />
        </LanguageProvider>
      );

      await findByText('2 + 2?');
      await findByLabelText('Question 1 of 2');

      // Wrong answer, then "Try Again" — this must NOT be treated as
      // progress (still the first, unfinished question), since scoring
      // (and advancing) only ever happens via Next/answerCurrentQuestion,
      // never via onRetry (see QuizScreen.handleRetry).
      await fireEvent.press(getByText('3'));
      await fireEvent.press(getByTestId('quiz-retry-answer'));
      expect(queryByLabelText('Question 2 of 2')).toBeNull();
      await findByLabelText('Question 1 of 2');

      // Now actually answer and press Next — real progress.
      await fireEvent.press(getByText('4'));
      await fireEvent.press(getByTestId('quiz-next'));

      await findByText('1 + 1?');
      await findByLabelText('Question 2 of 2');
    });

    it('shows no stale/leftover progress indicator once the quiz is finished', async () => {
      (loadQuestionsModule.loadQuestions as jest.Mock).mockResolvedValue(twoQuestions);
      jest.spyOn(Math, 'random').mockReturnValue(0.999999);

      const { findByText, getByText, getByTestId, queryByLabelText, queryByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <QuizScreen quizFolderUri="content://tree/quiz" childAge={5} />
        </LanguageProvider>
      );

      await findByText('2 + 2?');
      await fireEvent.press(getByText('4'));
      await fireEvent.press(getByTestId('quiz-next'));

      await findByText('1 + 1?');
      await fireEvent.press(getByText('2'));
      await fireEvent.press(getByTestId('quiz-next'));

      await waitFor(() => expect(getByText('Quiz done! Your score: 2 / 2')).toBeTruthy());
      expect(queryByTestId('quiz-progress')).toBeNull();
      expect(queryByLabelText('Question 2 of 2')).toBeNull();
      expect(queryByLabelText(/Question \d+ of \d+/)).toBeNull();
    });
  });
});

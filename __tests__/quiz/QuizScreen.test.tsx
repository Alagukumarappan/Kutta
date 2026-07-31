import React from 'react';
import { AccessibilityInfo, Animated } from 'react-native';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
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

  // Regression test for the premium-polish bug hunt: handleNext had no
  // re-entrancy guard (every other completion action in this screen already
  // has one). Two taps landing before the first setState's re-render commits
  // both fired with the same stale selectedOptionId closure, so React
  // applied two answerCurrentQuestion() updates from one tap — silently
  // skipping q2 entirely and scoring it with q1's answer. Confirmed this
  // fails (jumps straight to the finished screen) without the nextFiredRef
  // guard in QuizScreen.tsx's handleNext.
  it('guards Next against a rapid double-tap, advancing exactly one question per tap', async () => {
    (loadQuestionsModule.loadQuestions as jest.Mock).mockResolvedValue(twoQuestions);
    jest.spyOn(Math, 'random').mockReturnValue(0.999999);

    const { findByText, getByText, getByTestId, queryByText } = await render(
      <LanguageProvider initialLanguage="en">
        <QuizScreen quizFolderUri="content://tree/quiz" childAge={5} />
      </LanguageProvider>
    );

    await findByText('2 + 2?');
    await fireEvent.press(getByText('4'));
    await findByText('Correct!');

    const nextButton = getByTestId('quiz-next');
    // Two rapid presses before the first setState's re-render ever commits —
    // same "stale double-tap" shape as this codebase's other guard tests.
    await act(async () => {
      fireEvent.press(nextButton);
      fireEvent.press(nextButton);
    });

    await findByText('1 + 1?');
    expect(queryByText('Quiz done! Your score: 2 / 2')).toBeNull();
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

  // Regression test for the premium-polish visual-consistency pass:
  // QuizScreen's error state had been left behind on the old theme/tokens
  // look (a plain Pressable+text button) after every other gallery/player's
  // error state converged on RaisedCard+RaisedPrimaryButton — see this
  // file's own header comment, which explicitly flagged this as an
  // intentional-but-deferred gap.
  it('gives the error state a real design-system RaisedPrimaryButton, not the old bare Pressable', async () => {
    (loadQuestionsModule.loadQuestions as jest.Mock).mockRejectedValueOnce(new Error('SAF grant revoked'));

    const { findByTestId } = await render(
      <LanguageProvider initialLanguage="en">
        <QuizScreen quizFolderUri="content://tree/quiz" childAge={5} />
      </LanguageProvider>
    );

    const retryButton = await findByTestId('quiz-retry');
    // The old bare Pressable's style was a flat object (backgroundColor:
    // colors.coral, borderColor, borderWidth: 2, ...radii.xl). Paper's
    // Button (what RaisedPrimaryButton renders under the hood) instead
    // always exposes its style as an array whose second entry is a plain
    // `{ borderRadius }` — a reliable, non-brittle signal from outside that
    // this button now goes through the shared design-system component
    // instead of the old hand-rolled box.
    expect(Array.isArray(retryButton.props.style)).toBe(true);
    const { StyleSheet } = require('react-native');
    const flattened = StyleSheet.flatten(retryButton.props.style);
    expect(flattened.backgroundColor).toBeUndefined();
    expect(flattened.borderWidth).toBeUndefined();
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

  describe('completion screen actions', () => {
    async function finishQuizWithZeroScore() {
      const rendered = await render(
        <LanguageProvider initialLanguage="en">
          <QuizScreen quizFolderUri="content://tree/quiz" childAge={5} />
        </LanguageProvider>
      );
      const { findByText, getByText, getByTestId } = rendered;

      await findByText('2 + 2?');
      await fireEvent.press(getByText('3')); // wrong
      await fireEvent.press(getByTestId('quiz-next'));

      await findByText('1 + 1?');
      await fireEvent.press(getByText('3')); // wrong
      await fireEvent.press(getByTestId('quiz-next'));

      await rendered.findByText('Quiz done! Your score: 0 / 2');
      return rendered;
    }

    it('shows an encouraging message and at least one star even at a 0/2 score, with no shaming wording', async () => {
      (loadQuestionsModule.loadQuestions as jest.Mock).mockResolvedValue(twoQuestions);
      jest.spyOn(Math, 'random').mockReturnValue(0.999999);

      const { getByText, queryByText } = await finishQuizWithZeroScore();

      // At least one filled star even at the lowest possible score — the
      // existing starCount calc floors at 1, never 0.
      expect(getByText(/⭐/)).toBeTruthy();
      // No shaming/failure/ranking language at any score.
      expect(queryByText(/fail/i)).toBeNull();
      expect(queryByText(/bad/i)).toBeNull();
      expect(queryByText(/wrong/i)).toBeNull();
      expect(queryByText(/try harder/i)).toBeNull();
    });

    it('requests a spring pop-in animation for the score card when the completion screen appears', async () => {
      (loadQuestionsModule.loadQuestions as jest.Mock).mockResolvedValue(twoQuestions);
      jest.spyOn(Math, 'random').mockReturnValue(0.999999);
      const springSpy = jest.spyOn(Animated, 'spring');

      const { findByText, getByText, getByTestId } = await render(
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

      await findByText('Quiz done! Your score: 2 / 2');

      // Static check only (matches this codebase's established
      // safe-testing idiom for Animated-driven entrances, e.g.
      // __tests__/design-system/Buttons.test.tsx's own spring assertion):
      // confirms the score card's entrance requests a spring toward its
      // resting scale of 1, never replays a gesture sequence.
      const toValues = springSpy.mock.calls.map(([, config]) => (config as { toValue: number }).toValue);
      expect(toValues).toContain(1);

      springSpy.mockRestore();
    });

    // Regression test for the premium-polish accessibility pass: this
    // score-card pop-in is a separate, hand-rolled spring animation (not
    // routed through the shared CelebrationOverlay component, which
    // already respects the OS reduce-motion setting as of an earlier
    // iteration) — it needed its own opt-out.
    it('skips the bouncy spring for the score card when the OS reduce-motion setting is on', async () => {
      jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
      (loadQuestionsModule.loadQuestions as jest.Mock).mockResolvedValue(twoQuestions);
      jest.spyOn(Math, 'random').mockReturnValue(0.999999);
      const springSpy = jest.spyOn(Animated, 'spring');
      const timingSpy = jest.spyOn(Animated, 'timing');

      const { findByText, getByText, getByTestId } = await render(
        <LanguageProvider initialLanguage="en">
          <QuizScreen quizFolderUri="content://tree/quiz" childAge={5} />
        </LanguageProvider>
      );

      await findByText('2 + 2?');
      await fireEvent.press(getByText('4'));
      await fireEvent.press(getByTestId('quiz-next'));
      await findByText('1 + 1?');
      await fireEvent.press(getByText('2'));

      // Baseline taken right before the final Next press that reveals the
      // completion screen — QuestionRenderer's own option/feedback tilt
      // presses (useTiltPress) also call Animated.spring for unrelated
      // reasons throughout the quiz, so the assertion below checks for NO
      // NEW spring calls caused specifically by the score-card entrance,
      // rather than asserting spring was never called at all.
      const springCallsBefore = springSpy.mock.calls.length;
      const timingCallsBefore = timingSpy.mock.calls.length;

      await fireEvent.press(getByTestId('quiz-next'));
      await findByText('Quiz done! Your score: 2 / 2');

      expect(springSpy.mock.calls.length).toBe(springCallsBefore);
      expect(timingSpy.mock.calls.length).toBeGreaterThan(timingCallsBefore);
    });

    it('"Play Again" starts a genuinely fresh session — new shuffle, score and progress reset to zero', async () => {
      (loadQuestionsModule.loadQuestions as jest.Mock).mockResolvedValue(twoQuestions);
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.999999);

      const { findByText, getByText, getByTestId, findByLabelText } = await render(
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

      await findByText('Quiz done! Your score: 2 / 2');

      // Change the shuffle outcome for the NEXT buildSession call (rng=0
      // swaps the two-item array — see src/quiz/shuffle.ts) so a genuinely
      // fresh buildSession() call is observable, not just a state reset
      // reusing the previous session array/order.
      randomSpy.mockReturnValue(0);

      await fireEvent.press(await findByLabelText('Play Again'));

      // The session order flipped (q2 now first) — proof a real new
      // buildSession() call happened, not a cached/replayed session — and
      // score/progress are back to zero.
      await findByText('1 + 1?');
      await findByLabelText('Question 1 of 2');
      expect(() => getByText('Quiz done!', { exact: false })).toThrow();
    });

    it('guards "Play Again" against a rapid double-press only resetting the session once', async () => {
      (loadQuestionsModule.loadQuestions as jest.Mock).mockResolvedValue(twoQuestions);
      const randomSpy = jest.spyOn(Math, 'random').mockReturnValue(0.999999);

      const { findByText, getByText, getByTestId, findByLabelText } = await render(
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
      await findByText('Quiz done! Your score: 2 / 2');

      const callsBeforePlayAgain = randomSpy.mock.calls.length;
      const playAgainButton = await findByLabelText('Play Again');

      // Press the SAME captured element twice without re-querying, exactly
      // the "stale double-tap" shape used elsewhere in this codebase's
      // double-fire guards — without a guard this would shuffle twice.
      await fireEvent.press(playAgainButton);
      await fireEvent.press(playAgainButton);

      await findByText('2 + 2?');
      expect(randomSpy.mock.calls.length).toBe(callsBeforePlayAgain + 1);
    });

    it('"Home" navigates home via the provided callback, guarded against a rapid double-press', async () => {
      (loadQuestionsModule.loadQuestions as jest.Mock).mockResolvedValue(twoQuestions);
      jest.spyOn(Math, 'random').mockReturnValue(0.999999);
      const onGoHome = jest.fn();

      const { findByText, getByText, getByTestId, findByLabelText } = await render(
        <LanguageProvider initialLanguage="en">
          <QuizScreen quizFolderUri="content://tree/quiz" childAge={5} onGoHome={onGoHome} />
        </LanguageProvider>
      );

      await findByText('2 + 2?');
      await fireEvent.press(getByText('4'));
      await fireEvent.press(getByTestId('quiz-next'));
      await findByText('1 + 1?');
      await fireEvent.press(getByText('2'));
      await fireEvent.press(getByTestId('quiz-next'));
      await findByText('Quiz done! Your score: 2 / 2');

      const homeButton = await findByLabelText('Home');
      await fireEvent.press(homeButton);
      await fireEvent.press(homeButton);

      expect(onGoHome).toHaveBeenCalledTimes(1);
    });

    it('shows both actions with an accessible role and label in German too', async () => {
      (loadQuestionsModule.loadQuestions as jest.Mock).mockResolvedValue(twoQuestions);
      jest.spyOn(Math, 'random').mockReturnValue(0.999999);

      const { findByText, getByText, getByTestId, findByLabelText } = await render(
        <LanguageProvider initialLanguage="de">
          <QuizScreen quizFolderUri="content://tree/quiz" childAge={5} />
        </LanguageProvider>
      );

      await findByText('2 + 2?');
      await fireEvent.press(getByText('4'));
      await fireEvent.press(getByTestId('quiz-next'));
      await findByText('1 + 1?');
      await fireEvent.press(getByText('2'));
      await fireEvent.press(getByTestId('quiz-next'));
      await findByText('Quiz fertig! Dein Ergebnis: 2 / 2');

      const playAgain = await findByLabelText('Nochmal spielen');
      const home = await findByLabelText('Start');
      expect(playAgain.props.accessibilityRole).toBe('button');
      expect(home.props.accessibilityRole).toBe('button');
    });

    it('gives both completion buttons a real ~48x48 minimum touch target', async () => {
      (loadQuestionsModule.loadQuestions as jest.Mock).mockResolvedValue(twoQuestions);
      jest.spyOn(Math, 'random').mockReturnValue(0.999999);

      const { findByText, getByText, getByTestId } = await render(
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
      await findByText('Quiz done! Your score: 2 / 2');

      // Both completion buttons are now design-system RaisedPrimaryButton/
      // RaisedSecondaryButton (built on react-native-paper's <Button>), which
      // carries its minHeight on a nested content View (`contentStyle`)
      // rather than on the outer node the testID itself resolves to — so
      // this walks the whole rendered subtree for a minHeight, the same
      // "search descendants" idiom __tests__/video/VideoGallery.test.tsx
      // already uses for its own touch-target check, rather than reading
      // `.props.style` directly off the testID'd node.
      const collectMinHeights = (node: any): number[] => {
        if (!node || typeof node !== 'object') return [];
        const nodeStyles = Array.isArray(node.props?.style)
          ? node.props.style.flat(Infinity)
          : node.props?.style
          ? [node.props.style]
          : [];
        const own = nodeStyles
          .filter((s: any) => s && typeof s.minHeight === 'number')
          .map((s: any) => s.minHeight as number);
        const children: any[] = Array.isArray(node.children) ? node.children : [];
        return [...own, ...children.flatMap(collectMinHeights)];
      };

      const playAgainMinHeights = collectMinHeights(getByTestId('quiz-play-again').toJSON());
      const homeMinHeights = collectMinHeights(getByTestId('quiz-home').toJSON());
      expect(playAgainMinHeights.some((h) => h >= 48)).toBe(true);
      expect(homeMinHeights.some((h) => h >= 48)).toBe(true);
    });
  });
});

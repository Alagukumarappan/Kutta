import React from 'react';
import { AccessibilityInfo } from 'react-native';
import { render, fireEvent, within } from '@testing-library/react-native';
import { QuestionRenderer } from '../../src/quiz/QuestionRenderer';
import type { Question } from '../../src/types/quiz';
import { colors } from '../../src/design-system';

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

// Options with an image but no text are still a structurally-supported
// shape (see e.g. the "correct-answer reveal" describe block below, which
// exercises "a correct option with an image but no text") even though the
// bundled sample content always pairs image+text — this fixture exercises
// that path directly for accessibility.
const imageOnlyOptionsQuestion: Question = {
  id: 'q3',
  category: 'image',
  minAge: 2,
  maxAge: 8,
  question: { image: 'content://tree/quiz/images/apple.png', text: { en: 'Which one is red?', de: 'Welches ist rot?' } },
  options: [
    { id: 'a', image: 'content://tree/quiz/images/apple.png' },
    { id: 'b', image: 'content://tree/quiz/images/banana.png' },
    { id: 'c', image: 'content://tree/quiz/images/grape.png' },
    { id: 'd', image: 'content://tree/quiz/images/pear.png' },
  ],
  correctOptionId: 'a',
};

describe('QuestionRenderer', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // Regression test for the premium-polish accessibility pass: an
  // image-only option previously got `accessibilityLabel={undefined}`,
  // leaving a screen-reader user with an unlabeled "Button" for every one
  // of a question's four picture answers.
  it('gives every image-only option a positional accessibility label instead of none at all', async () => {
    const { findByLabelText } = await render(
      <QuestionRenderer
        question={imageOnlyOptionsQuestion}
        language="en"
        selectedOptionId={null}
        onSelect={jest.fn()}
        onNext={jest.fn()}
      />
    );

    expect(await findByLabelText('Answer option 1')).toBeTruthy();
    expect(await findByLabelText('Answer option 2')).toBeTruthy();
    expect(await findByLabelText('Answer option 3')).toBeTruthy();
    expect(await findByLabelText('Answer option 4')).toBeTruthy();
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

  // Regression test for a real bug fix: each option's own `disabled=
  // {hasAnswered}` only takes effect once the parent re-renders with an
  // updated `selectedOptionId` prop, so a rapid double-tap on two DIFFERENT
  // options landing before that commit previously called onSelect twice —
  // silently changing the child's actual answer to whichever option was
  // processed second, with no correction UI. Mirrors this codebase's other
  // double-fire guard tests (same "press before selectedOptionId prop
  // updates" shape as QuizScreen's own rapid-tap guards).
  it('guards against a rapid tap on two different options, only calling onSelect once', async () => {
    const onSelect = jest.fn();

    const { getByTestId } = await render(
      <QuestionRenderer
        question={imageQuestion}
        language="en"
        selectedOptionId={null}
        onSelect={onSelect}
        onNext={jest.fn()}
      />
    );

    // Both presses happen while selectedOptionId is still null (as it
    // would be from the parent's perspective, since it hasn't re-rendered
    // with the first answer yet) — the real-world shape of two taps
    // landing before React commits the parent's state update.
    await fireEvent.press(getByTestId('option-a'));
    await fireEvent.press(getByTestId('option-b'));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('a');
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

  it('shows the older-child (5-8) encouraging wrong-answer wording by default when no childAge is given', async () => {
    const { getByText } = await render(
      <QuestionRenderer
        question={imageQuestion}
        language="en"
        selectedOptionId="a"
        onSelect={jest.fn()}
        onNext={jest.fn()}
      />
    );

    expect(getByText('Nice try! Take another look.')).toBeTruthy();
  });

  describe('age-tiered wrong-answer feedback', () => {
    it('shows the younger-child (2-4) wording when childAge is 2-4', async () => {
      const { getByText, queryByText } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId="a"
          onSelect={jest.fn()}
          onNext={jest.fn()}
          childAge={3}
        />
      );

      expect(getByText("Good try! Let's try again.")).toBeTruthy();
      expect(queryByText('Nice try! Take another look.')).toBeNull();
    });

    it('shows the older-child (5-8) wording when childAge is 5-8', async () => {
      const { getByText } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId="a"
          onSelect={jest.fn()}
          onNext={jest.fn()}
          childAge={7}
        />
      );

      expect(getByText('Nice try! Take another look.')).toBeTruthy();
    });

    it('shows the younger-child German wording when childAge is 2-4 and language is de', async () => {
      const { getByText } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="de"
          selectedOptionId="a"
          onSelect={jest.fn()}
          onNext={jest.fn()}
          childAge={2}
        />
      );

      expect(getByText("Gut versucht! Versuchen wir's noch mal.")).toBeTruthy();
    });

    it('shows the older-child German wording when childAge is 5-8 and language is de', async () => {
      const { getByText } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="de"
          selectedOptionId="a"
          onSelect={jest.fn()}
          onNext={jest.fn()}
          childAge={8}
        />
      );

      expect(getByText('Netter Versuch! Schau noch mal genau hin.')).toBeTruthy();
    });

    // RENAMED from "never reveals the correct answer through the
    // wrong-answer wording itself (no answer text leakage)". That title
    // encoded an OLD design decision (the encouraging line must never
    // contain the answer, full stop) which has since been deliberately
    // SUPERSEDED by a developer-requested product change: the feedback
    // overlay now DOES reveal the correct answer's text on a wrong pick —
    // see the "correct-answer reveal" describe block below. This test still
    // has a real, narrower job: the encouraging phrase itself
    // (quizIncorrectYoung/Older) must stay a fixed, generic string that
    // never has the answer baked INTO it — the reveal always lives in its
    // own separate line/Text node instead, so this wording key keeps
    // working for questions with no revealable text (e.g. image-only
    // correct options) without ever needing per-question interpolation.
    it('keeps the encouraging wrong-answer phrase itself free of the answer text (the reveal lives in its own separate line, not baked into this wording)', async () => {
      const { getByText } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId="a"
          onSelect={jest.fn()}
          onNext={jest.fn()}
          childAge={3}
        />
      );

      // The correct option's own text ("4") must not appear inside the
      // encouraging feedback wording itself — it's shown separately (see
      // "correct-answer reveal" below), never spliced into this string.
      expect(getByText("Good try! Let's try again.").props.children).not.toContain('4');
    });
  });

  describe('correct-answer reveal (wrong-answer path)', () => {
    // Deliberate, developer-requested behavior change: the feedback overlay
    // now also names the correct option's own text on a wrong pick,
    // alongside (never replacing) the age-tiered encouraging line above.
    it('shows "The correct answer is: <text>" using the CORRECT option\'s text, not the selected wrong option\'s', async () => {
      const { getByText, queryByText } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId="a"
          onSelect={jest.fn()}
          onNext={jest.fn()}
        />
      );

      // imageQuestion's correctOptionId is 'b' (text "4"); selectedOptionId
      // here is the wrong option 'a' (text "3") — the reveal must name the
      // correct one ("4"), never the one the child actually picked.
      expect(getByText('The correct answer is: 4')).toBeTruthy();
      expect(queryByText('The correct answer is: 3')).toBeNull();
    });

    it('shows the German label + answer text when language is de', async () => {
      const { getByText } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="de"
          selectedOptionId="a"
          onSelect={jest.fn()}
          onNext={jest.fn()}
        />
      );

      expect(getByText('Die richtige Antwort ist: 4')).toBeTruthy();
    });

    it('shows the encouraging line AND the correct-answer reveal together, not one instead of the other', async () => {
      const { getByText } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId="a"
          onSelect={jest.fn()}
          onNext={jest.fn()}
          childAge={3}
        />
      );

      expect(getByText("Good try! Let's try again.")).toBeTruthy();
      expect(getByText('The correct answer is: 4')).toBeTruthy();
    });

    it('shows a small image (not a broken/"undefined" text line) when the correct option has an image but no text', async () => {
      const imageOnlyCorrectQuestion: Question = {
        id: 'q3',
        category: 'image',
        minAge: 2,
        maxAge: 8,
        question: { image: 'content://tree/quiz/images/missing.png' },
        options: [
          { id: 'a', image: 'content://tree/quiz/images/apple.png' },
          { id: 'b', text: { en: 'Wrong text', de: 'Falscher Text' } },
          { id: 'c', text: { en: 'Also wrong', de: 'Auch falsch' } },
          { id: 'd', text: { en: 'Still wrong', de: 'Immer noch falsch' } },
        ],
        correctOptionId: 'a',
      };

      const { getByText, getByTestId, queryByTestId } = await render(
        <QuestionRenderer
          question={imageOnlyCorrectQuestion}
          language="en"
          selectedOptionId="b"
          onSelect={jest.fn()}
          onNext={jest.fn()}
        />
      );

      // The encouraging line still renders on its own, plus a small image of
      // the correct option — but no "The correct answer is:" text line,
      // since there's no text to build one from (no crash, no "undefined").
      expect(getByText('Nice try! Take another look.')).toBeTruthy();
      expect(getByTestId('quiz-correct-answer-image')).toBeTruthy();
      expect(queryByTestId('quiz-correct-answer-text')).toBeNull();
    });

    it('shows both the text label and a small image when the correct option has both', async () => {
      const { getByText, getByTestId } = await render(
        <QuestionRenderer
          question={combinedQuestion}
          language="en"
          selectedOptionId="b"
          onSelect={jest.fn()}
          onNext={jest.fn()}
        />
      );

      // combinedQuestion's correctOptionId is 'a' (text "Apple", plus an
      // image) — both should render together, same as this file's own
      // question/option cards already do for combined content.
      expect(getByText('The correct answer is: Apple')).toBeTruthy();
      expect(getByTestId('quiz-correct-answer-image')).toBeTruthy();
    });

    it('renders nothing extra, and does not crash, for the (validation-guaranteed-unreachable) case of a correct option with neither text nor image', async () => {
      // src/quiz/loadQuestions.ts's isValidOption already rejects any real
      // loaded option missing both text and image, so this shape can't
      // occur via normal content loading — this test exists purely to pin
      // down that a hand-built Question in this shape still can't crash or
      // render a broken reveal, defensively, since QuestionRenderer itself
      // has no such guarantee at the type level.
      const neitherCorrectQuestion: Question = {
        id: 'q4',
        category: 'text',
        minAge: 2,
        maxAge: 8,
        question: { text: { en: 'Pick one', de: 'Wähle eins' } },
        options: [
          { id: 'a' } as Question['options'][number],
          { id: 'b', text: { en: 'Wrong', de: 'Falsch' } },
          { id: 'c', text: { en: 'Also wrong', de: 'Auch falsch' } },
          { id: 'd', text: { en: 'Still wrong', de: 'Immer noch falsch' } },
        ],
        correctOptionId: 'a',
      };

      const { getByText, queryByTestId } = await render(
        <QuestionRenderer
          question={neitherCorrectQuestion}
          language="en"
          selectedOptionId="b"
          onSelect={jest.fn()}
          onNext={jest.fn()}
        />
      );

      expect(getByText('Nice try! Take another look.')).toBeTruthy();
      expect(queryByTestId('quiz-correct-answer-reveal')).toBeNull();
    });
  });

  describe('wrong-answer retry action', () => {
    it('shows a distinct "Try Again" retry action (in addition to Next) when the answer is wrong', async () => {
      const { getByTestId, getByLabelText } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId="a"
          onSelect={jest.fn()}
          onNext={jest.fn()}
          onRetry={jest.fn()}
        />
      );

      expect(getByTestId('quiz-retry-answer')).toBeTruthy();
      expect(getByLabelText('Retry')).toBeTruthy();
      // Next must still exist too — the app already lets a child move on
      // after a wrong answer (see QuizScreen's existing scoring test), so
      // this iteration adds the retry option alongside it rather than
      // replacing it.
      expect(getByTestId('quiz-next')).toBeTruthy();
    });

    it('calls onRetry (and not onSelect/onNext) when "Try Again" is pressed', async () => {
      const onRetry = jest.fn();
      const onSelect = jest.fn();
      const onNext = jest.fn();

      const { getByTestId } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId="a"
          onSelect={onSelect}
          onNext={onNext}
          onRetry={onRetry}
        />
      );

      await fireEvent.press(getByTestId('quiz-retry-answer'));
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onSelect).not.toHaveBeenCalled();
      expect(onNext).not.toHaveBeenCalled();
    });

    it('also shows the retry action once the answer is correct, so a child can replay the question for fun', async () => {
      const { getByTestId } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId="b"
          onSelect={jest.fn()}
          onNext={jest.fn()}
          onRetry={jest.fn()}
        />
      );

      expect(getByTestId('quiz-retry-answer')).toBeTruthy();
      expect(getByTestId('quiz-next')).toBeTruthy();
    });

    it('calls onRetry (and not onSelect/onNext) when Retry is pressed after a CORRECT answer', async () => {
      const onRetry = jest.fn();
      const onSelect = jest.fn();
      const onNext = jest.fn();

      const { getByTestId } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId="b"
          onSelect={onSelect}
          onNext={onNext}
          onRetry={onRetry}
        />
      );

      await fireEvent.press(getByTestId('quiz-retry-answer'));
      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onSelect).not.toHaveBeenCalled();
      expect(onNext).not.toHaveBeenCalled();
    });
  });

  describe('redesigned answer options (design-system visual language)', () => {
    it('gives every option a comfortable touch target (>= 48dp) on the redesigned buttons', async () => {
      const { getByTestId } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId={null}
          onSelect={jest.fn()}
          onNext={jest.fn()}
        />
      );

      const { StyleSheet } = require('react-native');
      for (const id of ['a', 'b', 'c', 'd']) {
        const style = StyleSheet.flatten(getByTestId(`option-${id}`).props.style);
        expect(style.minHeight).toBeGreaterThanOrEqual(48);
      }
    });

    it('is disabled (no longer respond to a fresh tap) once the question has been answered', async () => {
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

      const option = getByTestId('option-c');
      expect(option.props.accessibilityState?.disabled).toBe(true);
      await fireEvent.press(option);
      expect(onSelect).not.toHaveBeenCalled();
    });

    it("uses the design system's jade/berry palette (not the old mint/coral theme) for the correct/incorrect mark badges", async () => {
      const { getByTestId } = await render(
        <QuestionRenderer
          question={combinedQuestion}
          language="en"
          selectedOptionId="b"
          onSelect={jest.fn()}
          onNext={jest.fn()}
        />
      );

      const { StyleSheet } = require('react-native');
      const correctMark = StyleSheet.flatten(getByTestId('option-mark-a').props.style);
      const incorrectMark = StyleSheet.flatten(getByTestId('option-mark-b').props.style);
      expect(correctMark.backgroundColor).toBe(colors.jadeDark);
      expect(incorrectMark.backgroundColor).toBe(colors.berryDark);
    });
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

  // No test here fires raw 'pressIn'/'pressOut' events on an option, in
  // either the pre- or post-answer state: HomeScreen's own card-tilt tests
  // (see "card press animation / navigation safety" in HomeScreen.test.tsx)
  // found that doing so — even when the app's own handler is a no-op, as it
  // is here once hasAnswered is true — exercises Pressable's own internal
  // animation machinery, which starts a real native-driver Animated call
  // with no native module backing it under Jest and corrupts the test
  // renderer for every later test in the file (confirmed by trying it here
  // too). Plain fireEvent.press (used throughout this file already) never
  // touches that path, so the existing "calls onSelect"/"does not call
  // onSelect again once answered" tests above already cover, end to end,
  // that onSelect firing correctly is unaffected by adding the tilt. The
  // gating itself (`!hasAnswered &&` on both onPressIn and onPressOut in
  // QuestionRenderer.tsx's renderOption) is small enough to verify by
  // reading the source directly, matching HomeScreen's own precedent of
  // relying on code-reading rather than driving Animated values in tests.

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

  describe('mark badge pop-in', () => {
    it('gives each mark badge its own animated opacity/scale entrance style, starting from a shrunk/invisible state', async () => {
      const { getByTestId } = await render(
        <QuestionRenderer
          question={combinedQuestion}
          language="en"
          selectedOptionId="b"
          onSelect={jest.fn()}
          onNext={jest.fn()}
        />
      );

      // Same technique the "feedback card pop-in + wash" tests above rely
      // on: Jest's react-native mock resolves an Animated.Value node to its
      // current plain numeric value when styles are flattened, and no
      // animation frame has been flushed yet at this point, so what's
      // checked is the entrance style's STARTING values (0 opacity / 0.3
      // scale) rather than the settled target (1/1).
      const { StyleSheet } = require('react-native');

      for (const testId of ['option-mark-a', 'option-mark-b']) {
        const flattened = StyleSheet.flatten(getByTestId(testId).props.style);
        expect(typeof flattened.opacity).toBe('number');
        expect(flattened.opacity).toBeCloseTo(0);
        expect(Array.isArray(flattened.transform)).toBe(true);
        const scaleEntry = flattened.transform.find((entry: Record<string, unknown>) => 'scale' in entry);
        expect(scaleEntry.scale).toBeCloseTo(0.3);
      }
    });

    it('starts a mark badge revealed for the first time on a brand new question from the same shrunk/invisible entrance values, not some other state', async () => {
      // A single awaited rerender — mirroring this file's established safe
      // pattern for driving Animated wiring (see the progress indicator
      // "animates the newly-current dot..." test) — going straight from an
      // unanswered first question to an answered SECOND question, rather
      // than a multi-step press/replay sequence, per this file's repeated
      // note that those have corrupted the RNTL renderer for later tests.
      //
      // What this test can and can't prove: Jest's Animated mock never
      // advances a running spring/timing past its starting value without an
      // explicit fake-timer tick (see the "feedback card pop-in + wash"
      // tests' own comment on this), and this file doesn't use fake timers.
      // So this can't drive the first question's mark to its SETTLED value
      // (1/1) and then show the second question's mark starting over from
      // 0.3/0 in contrast — that would need fake-timer machinery this file
      // deliberately avoids introducing. What it does verify: mounting
      // straight into an answered, brand-new question renders the badge at
      // the entrance style's starting values, exercising the effect's
      // `question.id`-inclusive dependency array on a real question change
      // (not just a `hasAnswered` flip) without needing multiple renders on
      // the SAME question. The reset-on-`!hasAnswered` branch itself is a
      // direct structural mirror of the already-covered cardScaleAnim/
      // cardOpacityAnim pattern just above, and is verified by code reading
      // for the same reason that one is (see the comment below).
      const { getByTestId, rerender } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId={null}
          onSelect={jest.fn()}
          onNext={jest.fn()}
        />
      );

      await rerender(
        <QuestionRenderer
          question={combinedQuestion}
          language="en"
          selectedOptionId="a"
          onSelect={jest.fn()}
          onNext={jest.fn()}
        />
      );

      const { StyleSheet } = require('react-native');
      const flattened = StyleSheet.flatten(getByTestId('option-mark-a').props.style);
      expect(flattened.opacity).toBeCloseTo(0);
      const scaleEntry = flattened.transform.find((entry: Record<string, unknown>) => 'scale' in entry);
      expect(scaleEntry.scale).toBeCloseTo(0.3);
    });

    // No test here drives the reset by cycling hasAnswered true -> false ->
    // true within one test (e.g. simulating Retry then a fresh answer on the
    // SAME question) for the same reason the "feedback card pop-in + wash"
    // describe block above skips that for cardScaleAnim/cardOpacityAnim:
    // multiple real Animated mounts/rerenders with no unmount in between has
    // repeatedly corrupted this file's RNTL renderer for later tests, even
    // when the test itself reports green. The reset logic here is a direct
    // structural mirror of that already-covered cardScaleAnim/cardOpacityAnim
    // pattern (`if (!hasAnswered) { ...setValue... return; }`), so it's
    // verified by code reading rather than by driving it here.
  });

  describe('correct-answer celebration', () => {
    it('shows a brief celebration with a localized message when the answer is correct', async () => {
      const { getByTestId, getByText } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId="b"
          onSelect={jest.fn()}
          onNext={jest.fn()}
        />
      );

      // This overlay is intentionally hidden from the accessibility tree
      // (see the dedicated test below), so RNTL's default queries — which
      // skip accessibility-hidden nodes — need includeHiddenElements here.
      expect(getByTestId('quiz-celebration', { includeHiddenElements: true })).toBeTruthy();
      expect(getByText('Yay! ⭐', { includeHiddenElements: true })).toBeTruthy();
    });

    it('shows the celebration message in German when language is de', async () => {
      const { getByText } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="de"
          selectedOptionId="b"
          onSelect={jest.fn()}
          onNext={jest.fn()}
        />
      );

      expect(getByText('Juhu! ⭐', { includeHiddenElements: true })).toBeTruthy();
    });

    it('does NOT show a celebration when the selected answer is wrong', async () => {
      const { queryByTestId } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId="a"
          onSelect={jest.fn()}
          onNext={jest.fn()}
        />
      );

      expect(queryByTestId('quiz-celebration', { includeHiddenElements: true })).toBeNull();
    });

    it('does NOT show a celebration before any option has been selected', async () => {
      const { queryByTestId } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId={null}
          onSelect={jest.fn()}
          onNext={jest.fn()}
        />
      );

      expect(queryByTestId('quiz-celebration', { includeHiddenElements: true })).toBeNull();
    });

    it('is purely decorative to assistive tech (hidden from the accessibility tree) since "Correct!" already announces the result', async () => {
      const { getByTestId } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId="b"
          onSelect={jest.fn()}
          onNext={jest.fn()}
        />
      );

      const celebration = getByTestId('quiz-celebration', { includeHiddenElements: true });
      expect(celebration.props.pointerEvents).toBe('none');
      expect(celebration.props.importantForAccessibility).toBe('no-hide-descendants');
      expect(celebration.props.accessibilityElementsHidden).toBe(true);
    });

    it('never blocks tapping "Next" while the celebration is showing', async () => {
      const onNext = jest.fn();
      const { getByTestId } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId="b"
          onSelect={jest.fn()}
          onNext={onNext}
        />
      );

      expect(getByTestId('quiz-celebration', { includeHiddenElements: true })).toBeTruthy();
      await fireEvent.press(getByTestId('quiz-next'));
      expect(onNext).toHaveBeenCalled();
    });

    it('cleans up its animation on unmount without warning or throwing (no leaked timers/handles)', async () => {
      const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

      const { unmount } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId="b"
          onSelect={jest.fn()}
          onNext={jest.fn()}
        />
      );

      expect(() => unmount()).not.toThrow();
      expect(consoleError).not.toHaveBeenCalled();

      consoleError.mockRestore();
    });

    it('does not re-render into a repeated celebration when re-rendered with the same correct selection (double-fire guard)', async () => {
      const { getAllByTestId, rerender } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId="b"
          onSelect={jest.fn()}
          onNext={jest.fn()}
        />
      );

      rerender(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId="b"
          onSelect={jest.fn()}
          onNext={jest.fn()}
        />
      );

      // Still exactly one celebration node, not one appended per re-render.
      expect(getAllByTestId('quiz-celebration', { includeHiddenElements: true })).toHaveLength(1);
    });
  });

  describe('feedback card pop-in + wash', () => {
    it('gives the feedback card its own animated opacity/scale entrance style, distinct from the celebration bubble', async () => {
      const { getByTestId } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId="b"
          onSelect={jest.fn()}
          onNext={jest.fn()}
        />
      );

      // Jest's react-native mock resolves Animated.Value nodes to their
      // current plain numeric value when styles are flattened (rather than
      // keeping the Animated.Value wrapper), so what's checked here is that
      // the card was given its OWN opacity/scale entrance keys at all
      // (structurally distinct from a plain static style), starting from
      // the pre-pop-in resting values (0 / 0.85) at mount, before the
      // spring/timing calls have had a chance to advance them.
      const { StyleSheet } = require('react-native');
      const card = getByTestId('quiz-feedback');
      const flattened = StyleSheet.flatten(card.props.style);

      expect(typeof flattened.opacity).toBe('number');
      expect(flattened.opacity).toBeCloseTo(0);
      expect(Array.isArray(flattened.transform)).toBe(true);
      const scaleEntry = flattened.transform.find((entry: Record<string, unknown>) => 'scale' in entry);
      expect(scaleEntry.scale).toBeCloseTo(0.85);

      // Distinct driver from the celebration bubble's own scaleAnim/
      // opacityAnim (see the "correct-answer celebration" describe block
      // above) — this test doesn't touch that bubble's animation at all.
      // The celebration bubble starts from scale 0 (not 0.85), which is
      // itself evidence the two are independent Animated.Values rather than
      // one shared driver.
      const celebration = getByTestId('quiz-celebration', { includeHiddenElements: true });
      const celebrationFlattened = StyleSheet.flatten(celebration.props.style);
      const celebrationScaleEntry = celebrationFlattened.transform.find(
        (entry: Record<string, unknown>) => 'scale' in entry
      );
      expect(celebrationScaleEntry.scale).toBeCloseTo(0);
      expect(celebrationScaleEntry.scale).not.toBeCloseTo(scaleEntry.scale);
    });

    it('gives the feedback card a jade wash when the answer is correct', async () => {
      const { getByTestId } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId="b"
          onSelect={jest.fn()}
          onNext={jest.fn()}
        />
      );

      const { StyleSheet } = require('react-native');
      const highlight = StyleSheet.flatten(getByTestId('feedback-wash-highlight').props.style);
      const shadow = StyleSheet.flatten(getByTestId('feedback-wash-shadow').props.style);
      expect(highlight.backgroundColor).toBe(colors.jade);
      expect(shadow.backgroundColor).toBe(colors.jadeDark);
    });

    it('gives the feedback card a berry wash when the answer is incorrect', async () => {
      const { getByTestId } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId="a"
          onSelect={jest.fn()}
          onNext={jest.fn()}
        />
      );

      const { StyleSheet } = require('react-native');
      const highlight = StyleSheet.flatten(getByTestId('feedback-wash-highlight').props.style);
      const shadow = StyleSheet.flatten(getByTestId('feedback-wash-shadow').props.style);
      expect(highlight.backgroundColor).toBe(colors.berry);
      expect(shadow.backgroundColor).toBe(colors.berryDark);
    });

    // No test here drives the card pop-in's cleanup by rerendering across a
    // hasAnswered true -> false -> true cycle (retry, then answer again):
    // doing so was tried, and — even with console.error mocked so the test
    // itself reported green — it left the test RENDERER corrupted for every
    // later test in this file (the "progress indicator" tests below started
    // failing to find elements that unquestionably render, once this test
    // ran first). That's the same class of problem this file's earlier
    // comment (see "wrong-answer retry action" section, above the
    // "does not call onSelect again..." test) already documents for raw
    // pressIn/pressOut events: driving multiple real Animated
    // mounts/rerenders with no unmount in between exercises native-driver
    // machinery Jest has no native module backing for, and corrupts
    // subsequent tests' render trees.
    //
    // The cleanup logic itself (the `if (!hasAnswered)` branch resetting
    // cardScaleAnim/cardOpacityAnim to 0.85/0 and the effect's `return () =>
    // animation.stop()`) is a small, direct mirror of the celebration
    // effect's own already-covered cleanup pattern just above in this file
    // (see "cleans up its animation on unmount without warning or
    // throwing"), so it's verified by code reading rather than by driving
    // it here.
  });

  describe('progress indicator', () => {
    it('renders exactly one dot per question and marks the current one, without a done dot at index 0', async () => {
      const { getByTestId, queryByTestId } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId={null}
          onSelect={jest.fn()}
          onNext={jest.fn()}
          currentIndex={0}
          totalQuestions={3}
        />
      );

      expect(getByTestId('quiz-progress-dot-0')).toBeTruthy();
      expect(getByTestId('quiz-progress-dot-1')).toBeTruthy();
      expect(getByTestId('quiz-progress-dot-2')).toBeTruthy();
      // Exactly 3 dots for 3 questions — no extra/missing dot.
      expect(queryByTestId('quiz-progress-dot-3')).toBeNull();

      // The current dot (index 0) is visually distinguished by its own
      // larger size (18x18 vs the default 14x14) — a concrete, non-color
      // structural assertion rather than relying on internal style-object
      // identity.
      const { StyleSheet } = require('react-native');
      const currentDotStyle = StyleSheet.flatten(getByTestId('quiz-progress-dot-0').props.style);
      const laterDotStyle = StyleSheet.flatten(getByTestId('quiz-progress-dot-2').props.style);
      expect(currentDotStyle.width).toBe(18);
      expect(laterDotStyle.width).toBe(14);
    });

    it('distinguishes done dots (before the current index) from the not-yet-reached ones', async () => {
      const { getByTestId } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId={null}
          onSelect={jest.fn()}
          onNext={jest.fn()}
          currentIndex={2}
          totalQuestions={4}
        />
      );

      const { StyleSheet } = require('react-native');
      const doneStyle = StyleSheet.flatten(getByTestId('quiz-progress-dot-0').props.style);
      const notYetStyle = StyleSheet.flatten(getByTestId('quiz-progress-dot-3').props.style);
      const currentStyle = StyleSheet.flatten(getByTestId('quiz-progress-dot-2').props.style);

      expect(doneStyle.backgroundColor).not.toBe(notYetStyle.backgroundColor);
      expect(currentStyle.width).toBe(18);
      expect(notYetStyle.width).toBe(14);
    });

    it('exposes a localized "Question X of Y" accessibility label (1-based) without any visible digits cluttering the screen', async () => {
      const { findByLabelText, queryByText } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId={null}
          onSelect={jest.fn()}
          onNext={jest.fn()}
          currentIndex={1}
          totalQuestions={5}
        />
      );

      await findByLabelText('Question 2 of 5');
      // Purely visual for sighted children — no "2 of 5"/"2/5" text node.
      expect(queryByText('2 / 5')).toBeNull();
      expect(queryByText(/of 5/)).toBeNull();
    });

    it('exposes the accessibility label in German', async () => {
      const { findByLabelText } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="de"
          selectedOptionId={null}
          onSelect={jest.fn()}
          onNext={jest.fn()}
          currentIndex={0}
          totalQuestions={3}
        />
      );

      await findByLabelText('Frage 1 von 3');
    });

    it('renders all 20 dots at the real maximum session length without the row exceeding a landscape-safe width budget', async () => {
      // Investigation (iteration 20, see PROGRESS.md Technical Decisions):
      // quizSession.ts's SESSION_LENGTH caps a session at 20 questions, and
      // sample-content/quiz/questions.json genuinely has exactly 20 eligible
      // questions for every supported age (2-7) — so 20 is not a
      // hypothetical worst case, it is the everyday session length. But this
      // app is landscape-only (RootNavigator.tsx locks orientation to
      // landscape before any content screen renders), so the row's fixed
      // dimension budget is the device's landscape WIDTH, not its portrait
      // width. Even the smallest realistic phones have a landscape width
      // well over 600px (a portrait width of ~320-412dp maps to a landscape
      // width in the 600-900dp range for any normal phone aspect ratio),
      // comfortably above the ~364px this row needs for 20 dots (19 dots at
      // 14px + 1 larger 18px current dot, each with spacing.xs/2 margin per
      // side). This test pins that arithmetic down concretely so a future
      // change to dot size/spacing/SESSION_LENGTH can't silently regress
      // past a real landscape-width budget without a test failing.
      const { getByTestId, queryByTestId } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId={null}
          onSelect={jest.fn()}
          onNext={jest.fn()}
          currentIndex={3}
          totalQuestions={20}
        />
      );

      for (let i = 0; i < 20; i++) {
        expect(getByTestId(`quiz-progress-dot-${i}`)).toBeTruthy();
      }
      expect(queryByTestId('quiz-progress-dot-20')).toBeNull();

      const { StyleSheet } = require('react-native');
      let totalWidth = 0;
      for (let i = 0; i < 20; i++) {
        const style = StyleSheet.flatten(getByTestId(`quiz-progress-dot-${i}`).props.style);
        const marginHorizontal = typeof style.marginHorizontal === 'number' ? style.marginHorizontal : 0;
        totalWidth += style.width + marginHorizontal * 2;
      }

      // Comfortably fits any real phone's landscape width (600px+), even
      // though it would NOT fit a portrait width (~360-412dp) — a non-issue
      // here specifically because this row only ever renders on the
      // landscape-locked quiz screen.
      expect(totalWidth).toBeLessThan(500);
    });

    it('rests each dot at its resting scale (1) on initial mount, before any advance has happened', async () => {
      const { getByTestId } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId={null}
          onSelect={jest.fn()}
          onNext={jest.fn()}
          currentIndex={2}
          totalQuestions={4}
        />
      );

      const { StyleSheet } = require('react-native');
      // Jest's react-native mock resolves Animated.Value nodes to their
      // current plain numeric value when styles are flattened (same
      // technique the "feedback card pop-in + wash" tests above already
      // rely on) — so this confirms no pop is queued/mid-flight purely from
      // mounting with a given currentIndex; the transition only fires on a
      // genuine advance, never on first render.
      for (const i of [0, 1, 2, 3]) {
        const flattened = StyleSheet.flatten(getByTestId(`quiz-progress-dot-${i}`).props.style);
        const scaleEntry = flattened.transform.find((entry: Record<string, unknown>) => 'scale' in entry);
        expect(scaleEntry.scale).toBeCloseTo(1);
      }
    });

    it('animates the newly-current dot growing in and the just-finished dot shrinking back, on a real question advance', async () => {
      // A single rerender with an updated currentIndex — mirroring this
      // file's existing safe pattern for driving Animated wiring (see the
      // "does not re-render into a repeated celebration..." test above) —
      // rather than a press/replay gesture sequence, per this file's
      // established note that those have repeatedly corrupted the RNTL
      // renderer for later tests.
      const { getByTestId, rerender } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId={null}
          onSelect={jest.fn()}
          onNext={jest.fn()}
          currentIndex={2}
          totalQuestions={5}
        />
      );

      // Awaited (unlike the double-fire guard test above, which only checks
      // tree structure): this test reads an Animated.Value's live numeric
      // state, which only updates once the effect that calls .setValue() has
      // actually run — and that effect is a passive effect, flushed only
      // once this rerender's returned act() promise resolves, not
      // synchronously when rerender() is merely called.
      await rerender(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId={null}
          onSelect={jest.fn()}
          onNext={jest.fn()}
          currentIndex={3}
          totalQuestions={5}
        />
      );

      const { StyleSheet } = require('react-native');
      const newCurrentFlattened = StyleSheet.flatten(getByTestId('quiz-progress-dot-3').props.style);
      const newCurrentScale = newCurrentFlattened.transform.find((entry: Record<string, unknown>) => 'scale' in entry).scale;
      const justDoneFlattened = StyleSheet.flatten(getByTestId('quiz-progress-dot-2').props.style);
      const justDoneScale = justDoneFlattened.transform.find((entry: Record<string, unknown>) => 'scale' in entry).scale;

      // Right after the advance, the spring has just been re-armed from its
      // start ratio (it hasn't yet had a chance to settle back to 1) — the
      // newly-current dot starts small-relative-to-its-new-size (14/18) and
      // the just-finished dot starts large-relative-to-its-new-size (18/14),
      // rather than both snapping straight to 1.
      expect(newCurrentScale).toBeCloseTo(14 / 18);
      expect(justDoneScale).toBeCloseTo(18 / 14);

      // Untouched dots keep resting at scale 1.
      const untouchedFlattened = StyleSheet.flatten(getByTestId('quiz-progress-dot-0').props.style);
      const untouchedScale = untouchedFlattened.transform.find((entry: Record<string, unknown>) => 'scale' in entry).scale;
      expect(untouchedScale).toBeCloseTo(1);
    });

    // Regression test for the premium-polish accessibility pass: this dot
    // pop always sprang from a smaller/larger starting ratio up to scale 1,
    // ignoring the OS reduce-motion setting, and can fire up to 20 times per
    // session. With the setting on, both dots should already be at their
    // resting scale immediately — no bounce to settle from.
    it('skips the dot-pop spring when the OS reduce-motion setting is on, landing both dots directly on their resting scale', async () => {
      jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);

      const { getByTestId, rerender } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId={null}
          onSelect={jest.fn()}
          onNext={jest.fn()}
          currentIndex={2}
          totalQuestions={5}
        />
      );
      // Let the async reduce-motion check resolve before the real advance
      // below — same reasoning as this codebase's other reduce-motion
      // tests (e.g. CelebrationOverlay's own).
      await rerender(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId={null}
          onSelect={jest.fn()}
          onNext={jest.fn()}
          currentIndex={2}
          totalQuestions={5}
        />
      );

      await rerender(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId={null}
          onSelect={jest.fn()}
          onNext={jest.fn()}
          currentIndex={3}
          totalQuestions={5}
        />
      );

      const { StyleSheet } = require('react-native');
      const newCurrentFlattened = StyleSheet.flatten(getByTestId('quiz-progress-dot-3').props.style);
      const newCurrentScale = newCurrentFlattened.transform.find((entry: Record<string, unknown>) => 'scale' in entry).scale;
      const justDoneFlattened = StyleSheet.flatten(getByTestId('quiz-progress-dot-2').props.style);
      const justDoneScale = justDoneFlattened.transform.find((entry: Record<string, unknown>) => 'scale' in entry).scale;

      expect(newCurrentScale).toBeCloseTo(1);
      expect(justDoneScale).toBeCloseTo(1);

      // `restoreAllMocks()` alone can't undo this specific mock:
      // `AccessibilityInfo.isReduceMotionEnabled` is already an auto-mocked
      // jest.fn() (a native module method), so `jest.spyOn` above just
      // returns that same mock rather than wrapping a real implementation
      // — there's no "original" to restore to, and the mocked `true` value
      // otherwise silently leaks into every later test in this file (a
      // real, verified bug — see ColoringScreen's iteration 30 notes for
      // the full mechanism). Explicitly resetting it back to `false` here
      // is what actually fixes it; `restoreAllMocks()` is kept for the
      // OTHER real (non-automocked) spies this test uses.
      (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(false);
      jest.restoreAllMocks();
    });

    it('does not render a progress row at all when currentIndex/totalQuestions are not provided', async () => {
      const { queryByTestId } = await render(
        <QuestionRenderer
          question={imageQuestion}
          language="en"
          selectedOptionId={null}
          onSelect={jest.fn()}
          onNext={jest.fn()}
        />
      );

      expect(queryByTestId('quiz-progress')).toBeNull();
    });
  });
});

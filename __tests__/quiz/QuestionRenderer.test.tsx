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

    it('never reveals the correct answer through the wrong-answer wording itself (no answer text leakage)', async () => {
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
      // feedback wording — only as the pre-existing on-option checkmark,
      // which is a separate, already-established piece of UI (see the
      // "marks the correct option" test above) that this iteration does not
      // change.
      expect(getByText("Good try! Let's try again.").props.children).not.toContain('4');
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

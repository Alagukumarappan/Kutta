import sampleQuestionsFile from '../../sample-content/quiz/questions.json';
import { filterQuestionsByAge } from '../../src/quiz/filterQuestions';
import { AGE_OPTIONS } from '../../src/components/AgePicker';
import type { Question } from '../../src/types/quiz';

function q(id: string, minAge: number, maxAge: number): Question {
  return {
    id,
    category: 'text',
    minAge,
    maxAge,
    question: { text: { en: 'x', de: 'x' } },
    options: [
      { id: 'a', text: { en: '1', de: '1' } },
      { id: 'b', text: { en: '2', de: '2' } },
      { id: 'c', text: { en: '3', de: '3' } },
      { id: 'd', text: { en: '4', de: '4' } },
    ],
    correctOptionId: 'a',
  };
}

describe('filterQuestionsByAge', () => {
  it('includes questions where minAge <= age <= maxAge', () => {
    const questions = [q('in-range', 2, 5), q('too-old', 6, 8), q('too-young', 0, 1)];
    expect(filterQuestionsByAge(questions, 4).map((r) => r.id)).toEqual(['in-range']);
  });

  it('treats boundaries as inclusive', () => {
    const questions = [q('lower-bound', 4, 6), q('upper-bound', 2, 4)];
    expect(filterQuestionsByAge(questions, 4).map((r) => r.id).sort()).toEqual(['lower-bound', 'upper-bound']);
  });

  it('returns an empty array when nothing matches', () => {
    expect(filterQuestionsByAge([q('too-old', 6, 8)], 3)).toEqual([]);
  });

  // Regression test for iteration 6: every band in the shipped sample content
  // was authored as a single year (minAge === maxAge === 2..7), but
  // AgePicker offers 2..8 — so a parent who chose the app's OWN maximum age
  // got zero eligible questions and the Quiz activity sat on its "no quiz
  // questions yet" empty state forever, with nothing on screen explaining
  // why. The per-minAge tally scripts/validate-sample-quiz-content.js printed
  // looked perfectly healthy the whole time, which is why this asserts the
  // real inclusive eligibility rule instead.
  describe('shipped sample content', () => {
    // The very file src/storage/sampleContent.ts bundles and seeds onto the
    // device, so this checks what a parent actually gets.
    const sampleQuestions = sampleQuestionsFile.questions as unknown as Question[];

    it.each(AGE_OPTIONS)('has eligible questions for a %i year old', (age) => {
      expect(filterQuestionsByAge(sampleQuestions, age).length).toBeGreaterThan(0);
    });
  });
});

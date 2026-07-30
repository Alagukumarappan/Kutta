import { filterQuestionsByAge } from '../../src/quiz/filterQuestions';
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
});

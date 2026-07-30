import { buildSession, initialSessionState, answerCurrentQuestion } from '../../src/quiz/quizSession';
import type { Question } from '../../src/types/quiz';

function makeQuestions(n: number, minAge = 2, maxAge = 8): Question[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `q${i}`,
    category: 'text' as const,
    minAge,
    maxAge,
    question: { text: { en: `Q${i}`, de: `Q${i}` } },
    options: [
      { id: 'a', text: { en: '1', de: '1' } },
      { id: 'b', text: { en: '2', de: '2' } },
      { id: 'c', text: { en: '3', de: '3' } },
      { id: 'd', text: { en: '4', de: '4' } },
    ],
    correctOptionId: 'a',
  }));
}

describe('buildSession', () => {
  it('caps the session at 20 questions when more are eligible', () => {
    const session = buildSession(makeQuestions(30), 5);
    expect(session).toHaveLength(20);
  });

  it('uses all eligible questions when fewer than 20 exist', () => {
    const session = buildSession(makeQuestions(7), 5);
    expect(session).toHaveLength(7);
  });

  it('excludes questions outside the age range', () => {
    const inRange = makeQuestions(3, 2, 5);
    const outOfRange = makeQuestions(3, 6, 8).map((q, i) => ({ ...q, id: `out${i}` }));
    const session = buildSession([...inRange, ...outOfRange], 3);
    expect(session.every((q) => q.minAge <= 3 && q.maxAge >= 3)).toBe(true);
  });
});

describe('quiz session reducer', () => {
  it('starts at question 0 with score 0, not finished', () => {
    const session = buildSession(makeQuestions(3), 5);
    const state = initialSessionState(session);
    expect(state.currentIndex).toBe(0);
    expect(state.score).toBe(0);
    expect(state.isFinished).toBe(false);
  });

  it('increments score on a correct answer and advances', () => {
    const session = buildSession(makeQuestions(2), 5);
    let state = initialSessionState(session);
    state = answerCurrentQuestion(state, session[0].correctOptionId);
    expect(state.score).toBe(1);
    expect(state.currentIndex).toBe(1);
    expect(state.isFinished).toBe(false);
  });

  it('does not increment score on a wrong answer but still advances', () => {
    const session = buildSession(makeQuestions(2), 5);
    const wrongOption = session[0].options.find((o) => o.id !== session[0].correctOptionId)!.id;
    let state = initialSessionState(session);
    state = answerCurrentQuestion(state, wrongOption);
    expect(state.score).toBe(0);
    expect(state.currentIndex).toBe(1);
  });

  it('marks isFinished true after the last question is answered', () => {
    const session = buildSession(makeQuestions(1), 5);
    let state = initialSessionState(session);
    state = answerCurrentQuestion(state, session[0].correctOptionId);
    expect(state.isFinished).toBe(true);
    expect(state.score).toBe(1);
  });

  it('returns unchanged state when called on an already-finished session', () => {
    const session = buildSession(makeQuestions(1), 5);
    let state = initialSessionState(session);
    // Answer the last question to make isFinished true
    state = answerCurrentQuestion(state, session[0].correctOptionId);
    expect(state.isFinished).toBe(true);
    const beforeSecondCall = { ...state };
    // Try to answer again when already finished
    const afterSecondCall = answerCurrentQuestion(state, 'any-option-id');
    expect(afterSecondCall.currentIndex).toBe(beforeSecondCall.currentIndex);
    expect(afterSecondCall.score).toBe(beforeSecondCall.score);
    expect(afterSecondCall.isFinished).toBe(beforeSecondCall.isFinished);
  });
});

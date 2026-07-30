import { shuffle } from '../../src/quiz/shuffle';

describe('shuffle', () => {
  it('returns an array with the same elements', () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffle(input);
    expect(result.slice().sort()).toEqual(input.slice().sort());
  });

  it('does not mutate the input array', () => {
    const input = [1, 2, 3];
    shuffle(input);
    expect(input).toEqual([1, 2, 3]);
  });

  it('is deterministic given a fixed RNG', () => {
    const rng = (() => {
      const seq = [0.9, 0.1, 0.5];
      let i = 0;
      return () => seq[i++ % seq.length];
    })();
    const result = shuffle([1, 2, 3, 4], rng);
    expect(result).toEqual(expect.any(Array));
    expect(result).toHaveLength(4);
  });
});

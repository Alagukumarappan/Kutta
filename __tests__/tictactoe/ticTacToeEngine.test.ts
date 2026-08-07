import {
  createEmptyBoard,
  checkWinner,
  getWinningLine,
  isBoardFull,
  getEmptyIndices,
  getGameStatus,
  playerToMove,
  findBestMove,
  getComputerMove,
  WINNING_COMBINATIONS,
  type Board,
} from '../../src/tictactoe/ticTacToeEngine';

function boardFrom(cells: (string | null)[]): Board {
  return cells.map((c) => (c === null ? null : (c as 'X' | 'O')));
}

describe('createEmptyBoard', () => {
  it('returns 9 empty cells', () => {
    const board = createEmptyBoard();
    expect(board).toHaveLength(9);
    expect(board.every((c) => c === null)).toBe(true);
  });
});

describe('checkWinner', () => {
  it('detects every one of the 8 winning combinations', () => {
    for (const combo of WINNING_COMBINATIONS) {
      const board = createEmptyBoard();
      combo.forEach((i) => (board[i] = 'X'));
      expect(checkWinner(board, 'X')).toBe(true);
      expect(checkWinner(board, 'O')).toBe(false);
    }
  });

  it('returns false on an empty or in-progress board', () => {
    const board = boardFrom(['X', 'O', null, null, 'X', null, null, null, null]);
    expect(checkWinner(board, 'X')).toBe(false);
    expect(checkWinner(board, 'O')).toBe(false);
  });
});

describe('getWinningLine', () => {
  it('returns the exact winning indices', () => {
    const board = boardFrom(['X', 'X', 'X', null, null, null, null, null, null]);
    expect(getWinningLine(board, 'X')).toEqual([0, 1, 2]);
  });

  it('returns null when there is no winner', () => {
    const board = createEmptyBoard();
    expect(getWinningLine(board, 'X')).toBeNull();
  });
});

describe('isBoardFull / getEmptyIndices', () => {
  it('reports full only when every cell is occupied', () => {
    const full = boardFrom(['X', 'O', 'X', 'O', 'X', 'O', 'X', 'O', 'X']);
    expect(isBoardFull(full)).toBe(true);
    expect(getEmptyIndices(full)).toEqual([]);
  });

  it('lists every empty index in order', () => {
    const board = boardFrom(['X', null, 'O', null, null, 'X', null, null, null]);
    expect(getEmptyIndices(board)).toEqual([1, 3, 4, 6, 7, 8]);
  });
});

describe('playerToMove', () => {
  it('gives X the first move on an empty board', () => {
    expect(playerToMove(createEmptyBoard())).toBe('X');
  });

  it('alternates strictly as marks are added, regardless of where they are', () => {
    const board = createEmptyBoard();
    const expected: ('X' | 'O')[] = ['X', 'O', 'X', 'O', 'X', 'O', 'X', 'O', 'X'];
    // Deliberately not in index order — whose turn it is depends only on HOW
    // MANY marks are down, never on which cells they landed in.
    const order = [4, 0, 8, 2, 6, 1, 7, 3, 5];
    order.forEach((index, moveNumber) => {
      expect(playerToMove(board)).toBe(expected[moveNumber]);
      board[index] = expected[moveNumber];
    });
    expect(isBoardFull(board)).toBe(true);
  });
});

describe('getGameStatus', () => {
  it('reports in-progress on a fresh board', () => {
    expect(getGameStatus(createEmptyBoard())).toEqual({ status: 'in-progress' });
  });

  it('reports a win for whichever player completed a line', () => {
    const board = boardFrom(['O', 'O', 'O', 'X', 'X', null, null, null, null]);
    expect(getGameStatus(board)).toEqual({ status: 'won', winner: 'O', line: [0, 1, 2] });
  });

  it('reports a draw when the board is full with no winner', () => {
    const board = boardFrom(['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X']);
    expect(getGameStatus(board)).toEqual({ status: 'draw' });
  });
});

describe('findBestMove (unbeatable minimax, ported from the Angular source)', () => {
  it('takes the immediate winning move when one is available', () => {
    // O has two in a row (0,1) and can win at 2.
    const board = boardFrom(['O', 'O', null, 'X', 'X', null, null, null, null]);
    expect(findBestMove(board)).toBe(2);
  });

  it('blocks the human\'s immediate winning move when it cannot win itself', () => {
    // X has two in a row (0,1) threatening to win at 2 — O must block there.
    const board = boardFrom(['X', 'X', null, null, 'O', null, null, null, null]);
    expect(findBestMove(board)).toBe(2);
  });

  it('returns null when the board is already full', () => {
    const board = boardFrom(['X', 'O', 'X', 'O', 'X', 'O', 'X', 'O', 'X']);
    expect(findBestMove(board)).toBeNull();
  });

  it('never loses a full game against itself played out move by move', () => {
    // Drive a full human-vs-optimal-AI game where the human also plays every
    // move optimally (by also using findBestMove for X) — a correct minimax
    // must end in a draw, never a human win, since tic-tac-toe with perfect
    // play from both sides is always a draw.
    let board = createEmptyBoard();
    let turn: 'X' | 'O' = 'X';
    while (getGameStatus(board).status === 'in-progress') {
      const working = board.slice();
      const move =
        turn === 'O'
          ? findBestMove(working)
          : (() => {
              // Simulate an optimal human move too, by temporarily treating
              // X as the maximizer: reuse findBestMove by swapping symbols.
              const swapped = working.map((c) => (c === 'X' ? 'O' : c === 'O' ? 'X' : c));
              return findBestMove(swapped);
            })();
      if (move === null) break;
      board[move] = turn;
      turn = turn === 'X' ? 'O' : 'X';
    }
    expect(getGameStatus(board).status).not.toEqual('won');
  });

  it('does not mutate the board it is given', () => {
    const board = boardFrom(['O', 'O', null, 'X', 'X', null, null, null, null]);
    const copy = board.slice();
    findBestMove(board);
    expect(board).toEqual(copy);
  });

  // Regression tests for a real bug caught before it shipped: TicTacToeScreen
  // added a random coin flip for which mark the computer/friend plays this
  // game (previously the computer was always 'O'). Without an explicit
  // `computerMark` parameter here, the search would have kept maximizing
  // for 'O' even on a game where the computer is actually playing 'X' —
  // i.e. it would have computed the best move FOR THE CHILD instead of for
  // itself, playing backwards half the time. These mirror the exact
  // 'O'-mark tests above, with roles swapped.
  describe('computerMark parameter (the computer is not always O)', () => {
    it('takes the immediate winning move when one is available, when the computer plays X', () => {
      // X has two in a row (0,1) and can win at 2 — this time X is the computer.
      const board = boardFrom(['X', 'X', null, 'O', 'O', null, null, null, null]);
      expect(findBestMove(board, 'X')).toBe(2);
    });

    it("blocks the opponent's immediate winning move when it cannot win itself, when the computer plays X", () => {
      // O has two in a row (0,1) threatening to win at 2 — X (the computer
      // this game) must block there.
      const board = boardFrom(['O', 'O', null, null, 'X', null, null, null, null]);
      expect(findBestMove(board, 'X')).toBe(2);
    });

    it('never loses a full game against itself played out move by move, with the computer playing X', () => {
      // Same "perfect play from both sides always draws" invariant as the
      // 'O'-mark test above, but with the computer (findBestMove(_, 'X'))
      // moving first as X and an equally-optimal opponent playing O.
      let board = createEmptyBoard();
      let turn: 'X' | 'O' = 'X';
      while (getGameStatus(board).status === 'in-progress') {
        const working = board.slice();
        const move = turn === 'X' ? findBestMove(working, 'X') : findBestMove(working, 'O');
        if (move === null) break;
        board[move] = turn;
        turn = turn === 'X' ? 'O' : 'X';
      }
      expect(getGameStatus(board).status).not.toEqual('won');
    });

    it('getComputerMove threads computerMark through to findBestMove for "hard"', () => {
      const board = boardFrom(['X', 'X', null, 'O', 'O', null, null, null, null]);
      expect(getComputerMove(board, 'hard', Math.random, 'X')).toBe(findBestMove(board, 'X'));
      // Sanity: this is NOT the same move the default ('O') mark would give
      // for this same board — confirms the parameter genuinely changes the
      // search's outcome rather than being silently ignored.
      expect(getComputerMove(board, 'hard', Math.random, 'X')).not.toBe(getComputerMove(board, 'hard'));
    });
  });
});

describe('getComputerMove', () => {
  it('"hard" always returns the optimal move (same as findBestMove)', () => {
    const board = boardFrom(['O', 'O', null, 'X', 'X', null, null, null, null]);
    expect(getComputerMove(board, 'hard')).toBe(findBestMove(board));
  });

  it('"easy" always returns a random legal move, using the injected RNG', () => {
    const board = boardFrom(['O', 'O', null, 'X', 'X', null, null, null, null]);
    // Empty indices are [2, 5, 6, 7, 8] (5 options) — random() = 0 picks the first.
    expect(getComputerMove(board, 'easy', () => 0)).toBe(2);
    // random() just under 1 picks the last.
    expect(getComputerMove(board, 'easy', () => 0.999)).toBe(8);
  });

  it('"medium" picks the optimal move when the coin flip lands below 0.5, random otherwise (same RNG reused for the random pick)', () => {
    const board = boardFrom(['O', 'O', null, 'X', 'X', null, null, null, null]);
    // 0.1 < 0.5 -> optimal path.
    expect(getComputerMove(board, 'medium', () => 0.1)).toBe(findBestMove(board));
    // 0.9 >= 0.5 -> random path; the SAME injected RNG is reused for the pick
    // itself: empties are [2,5,6,7,8] (5 options), floor(0.9*5)=4 -> index 8.
    expect(getComputerMove(board, 'medium', () => 0.9)).toBe(8);
  });

  it('returns null for every difficulty once the board is full', () => {
    const board = boardFrom(['X', 'O', 'X', 'O', 'X', 'O', 'X', 'O', 'X']);
    expect(getComputerMove(board, 'easy')).toBeNull();
    expect(getComputerMove(board, 'medium')).toBeNull();
    expect(getComputerMove(board, 'hard')).toBeNull();
  });
});

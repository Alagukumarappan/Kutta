// Core tic-tac-toe rules, ported 1:1 from the existing Angular reference
// implementation at /home/aramasamy/repository/mine/main/src/app/game/game.component.ts
// (win-combinations, checkWinner, and the minimax/findBestMove search) —
// only the DIFFICULTY layer at the bottom of this file is new, since that
// source has none (its computer opponent always plays the single, full,
// unbeatable minimax search). Framework-agnostic: no React/RN imports, so
// it's usable and testable independently of any screen.

export type Player = 'X' | 'O';
export type Cell = Player | null;
export type Board = Cell[]; // always length 9, row-major 3x3 (0,1,2 / 3,4,5 / 6,7,8)
export type Difficulty = 'easy' | 'medium' | 'hard';

// The human always plays X, the computer always plays O — same fixed
// assignment as the source algorithm (see computerPlay's `currentPlayer ===
// 'O'` check there).
export const HUMAN_PLAYER: Player = 'X';
export const COMPUTER_PLAYER: Player = 'O';

// Exact winning-line indices from the source algorithm's
// `winningCombinations` array.
export const WINNING_COMBINATIONS: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export function createEmptyBoard(): Board {
  return Array(9).fill(null);
}

// Direct port of the source's `checkWinner(board, player)`.
export function checkWinner(board: Board, player: Player): boolean {
  return WINNING_COMBINATIONS.some((combination) => combination.every((index) => board[index] === player));
}

// Not present in the source (which never highlights the winning line) — a
// small addition so the UI can visually mark the three winning cells.
export function getWinningLine(board: Board, player: Player): readonly number[] | null {
  return WINNING_COMBINATIONS.find((combination) => combination.every((index) => board[index] === player)) ?? null;
}

export function isBoardFull(board: Board): boolean {
  return board.every((cell) => cell !== null);
}

export function getEmptyIndices(board: Board): number[] {
  const indices: number[] = [];
  board.forEach((cell, index) => {
    if (cell === null) indices.push(index);
  });
  return indices;
}

export type GameStatus =
  | { status: 'in-progress' }
  | { status: 'won'; winner: Player; line: readonly number[] }
  | { status: 'draw' };

// Not present as its own function in the source (it inlines the equivalent
// checks into `playMove`) — pulled out here as a pure query so the UI layer
// can read it without re-deriving the same win/draw ordering itself.
export function getGameStatus(board: Board): GameStatus {
  for (const player of [HUMAN_PLAYER, COMPUTER_PLAYER] as const) {
    const line = getWinningLine(board, player);
    if (line) return { status: 'won', winner: player, line };
  }
  if (isBoardFull(board)) return { status: 'draw' };
  return { status: 'in-progress' };
}

// Direct port of the source's `miniMax(board, depth, isMaximizing)`: the
// computer maximizes, the human is assumed to play optimally and minimizes.
// Mutates `board` in place and backtracks, exactly like the source — safe
// here since every caller only ever passes a private working copy (see
// findBestMove below).
//
// `computerMark` defaults to COMPUTER_PLAYER ('O'), matching the source
// algorithm's own fixed assumption exactly — every existing caller that
// doesn't pass it behaves byte-identically to before. It exists so
// TicTacToeScreen.tsx can tell the search which mark IT actually has this
// game: the app added a random coin flip for who starts (see that screen's
// own childIsX state), so the computer isn't always guaranteed to be 'O'
// any more — the search must optimize for whichever mark it really is, not
// silently keep maximizing for 'O' while actually playing 'X'.
function minimax(board: Board, depth: number, isMaximizing: boolean, computerMark: Player = COMPUTER_PLAYER): number {
  const humanMark: Player = computerMark === 'X' ? 'O' : 'X';
  if (checkWinner(board, computerMark)) return 10 - depth;
  if (checkWinner(board, humanMark)) return depth - 10;
  if (isBoardFull(board)) return 0;

  if (isMaximizing) {
    let bestScore = -Infinity;
    for (const index of getEmptyIndices(board)) {
      board[index] = computerMark;
      bestScore = Math.max(bestScore, minimax(board, depth + 1, false, computerMark));
      board[index] = null;
    }
    return bestScore;
  }

  let bestScore = Infinity;
  for (const index of getEmptyIndices(board)) {
    board[index] = humanMark;
    bestScore = Math.min(bestScore, minimax(board, depth + 1, true, computerMark));
    board[index] = null;
  }
  return bestScore;
}

// Direct port of the source's `findBestMove(board)` — always returns the
// single optimal (unbeatable) move for the computer, or null if the board is
// already full. This is the ENTIRE computer opponent in the source
// algorithm; it becomes this app's "hard" difficulty below.
//
// `computerMark` — see minimax's own comment above for why this exists and
// why its default preserves every existing caller's exact behavior.
export function findBestMove(board: Board, computerMark: Player = COMPUTER_PLAYER): number | null {
  const working = board.slice();
  let bestScore = -Infinity;
  let bestMove: number | null = null;

  for (const index of getEmptyIndices(working)) {
    working[index] = computerMark;
    const score = minimax(working, 0, false, computerMark);
    working[index] = null;

    if (score > bestScore) {
      bestScore = score;
      bestMove = index;
    }
  }

  return bestMove;
}

function randomMove(board: Board, random: () => number): number | null {
  const empties = getEmptyIndices(board);
  if (empties.length === 0) return null;
  return empties[Math.floor(random() * empties.length)];
}

// ---------------------------------------------------------------------------
// Difficulty
// ---------------------------------------------------------------------------
// The source Angular game has no difficulty levels at all — its computer
// always runs the full minimax above (this app's "hard"). Kutta's setup
// screen needs a difficulty choice, so this layer sits ON TOP of the
// unmodified ported algorithm rather than changing it:
//   - "hard"   -> exactly the source behavior: always the optimal move.
//   - "easy"   -> always a random legal move (loses on purpose).
//   - "medium" -> a coin flip between the optimal move and a random one, so
//                 it plays well but not flawlessly.
// `computerMark` — see minimax's own comment above; defaults to
// COMPUTER_PLAYER ('O') so every existing caller's behavior is unchanged.
export function getComputerMove(
  board: Board,
  difficulty: Difficulty,
  random: () => number = Math.random,
  computerMark: Player = COMPUTER_PLAYER
): number | null {
  if (difficulty === 'easy') return randomMove(board, random);
  if (difficulty === 'medium')
    return random() < 0.5 ? findBestMove(board, computerMark) : randomMove(board, random);
  return findBestMove(board, computerMark);
}

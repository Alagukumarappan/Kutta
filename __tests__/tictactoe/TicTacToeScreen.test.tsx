import React from 'react';
import { render, fireEvent, waitFor, act, within } from '@testing-library/react-native';
import { TicTacToeScreen } from '../../src/tictactoe/TicTacToeScreen';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import { getComputerMove } from '../../src/tictactoe/ticTacToeEngine';
import { playCorrectSound, playWrongSound } from '../../src/audio/soundEffects';

jest.mock('../../src/audio/soundEffects', () => ({
  playCorrectSound: jest.fn(),
  playWrongSound: jest.fn(),
}));

// Defaults to the REAL minimax (via jest.fn(actual.getComputerMove)) for
// every test — only the one test below that needs a guaranteed computer
// win overrides it with `.mockReturnValueOnce(...)` for a few calls, which
// Jest automatically falls back off of afterward. Deliberately never
// calling mockReset/mockClear on this particular mock anywhere in this
// file, since that would also wipe the real-implementation passthrough for
// every other test (the module mock is a single shared instance for the
// whole file).
jest.mock('../../src/tictactoe/ticTacToeEngine', () => {
  const actual = jest.requireActual('../../src/tictactoe/ticTacToeEngine');
  return { ...actual, getComputerMove: jest.fn(actual.getComputerMove) };
});

function renderGame(props: Partial<React.ComponentProps<typeof TicTacToeScreen>> = {}) {
  const onMenu = props.onMenu ?? jest.fn();
  return render(
    <LanguageProvider initialLanguage="en">
      <TicTacToeScreen
        mode={props.mode ?? 'friend'}
        difficulty={props.difficulty ?? null}
        childName={props.childName ?? 'Sam'}
        friendName={props.friendName ?? 'Alex'}
        onMenu={onMenu}
      />
    </LanguageProvider>
  );
}

// Each filled cell's mark has its own dedicated testID (see
// TicTacToeScreen.tsx) rather than reading it off the surrounding
// Pressable's `.props.children` — Pressable always renders an extra
// PressabilityDebugView alongside its real children in this RN version, so
// `.props.children` on the Pressable itself is never a simple
// falsy-when-empty value.
function cellValue(queryByTestId: (id: string) => any, index: number): string | null {
  const mark = queryByTestId(`tictactoe-cell-${index}-mark`);
  return mark ? mark.props.children : null;
}

describe('TicTacToeScreen', () => {
  // Every existing test in this file was written assuming "the child always
  // starts as X" — pin Math.random below 0.5 so the random coin flip (see
  // TicTacToeScreen.tsx's childIsX state) reliably lands there, preserving
  // these tests' original, deterministic intent. The randomization itself
  // (both outcomes actually reachable, and that Retry re-rolls) is covered
  // by its own dedicated tests further down, which mock this explicitly.
  beforeEach(() => {
    jest.spyOn(Math, 'random').mockReturnValue(0);
    (playCorrectSound as jest.Mock).mockClear();
    (playWrongSound as jest.Mock).mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('friend mode (no computer involved)', () => {
    it('starts with an empty board and X to move first', async () => {
      const { queryByTestId, getByTestId } = await renderGame({ mode: 'friend' });

      for (let i = 0; i < 9; i++) {
        expect(cellValue(queryByTestId, i)).toBeNull();
      }
      // X always moves first and is always the app's own child (Sam, per
      // renderGame's default childName) in friend mode.
      expect(getByTestId('tictactoe-status').props.children).toBe("Sam's turn");
    });

    it('alternates X and O as cells are tapped', async () => {
      const { getByTestId, queryByTestId } = await renderGame({ mode: 'friend' });

      await fireEvent.press(getByTestId('tictactoe-cell-0'));
      expect(cellValue(queryByTestId, 0)).toBe('X');
      expect(getByTestId('tictactoe-status').props.children).toBe("Alex's turn");

      await fireEvent.press(getByTestId('tictactoe-cell-1'));
      expect(cellValue(queryByTestId, 1)).toBe('O');
      expect(getByTestId('tictactoe-status').props.children).toBe("Sam's turn");
    });

    it('does not let a player overwrite an already-filled cell', async () => {
      const { getByTestId, queryByTestId } = await renderGame({ mode: 'friend' });

      await fireEvent.press(getByTestId('tictactoe-cell-0')); // X
      await fireEvent.press(getByTestId('tictactoe-cell-0')); // still X's cell, O tries and fails

      expect(cellValue(queryByTestId, 0)).toBe('X');
      expect(getByTestId('tictactoe-status').props.children).toBe("Alex's turn");
    });

    it('declares the winner and shows Play Again / Menu once a line is completed', async () => {
      const { getByTestId, findByTestId } = await renderGame({ mode: 'friend' });

      // X: 0, 1, 2 (top row) with O taking 3, 4 in between.
      await fireEvent.press(getByTestId('tictactoe-cell-0')); // X
      await fireEvent.press(getByTestId('tictactoe-cell-3')); // O
      await fireEvent.press(getByTestId('tictactoe-cell-1')); // X
      await fireEvent.press(getByTestId('tictactoe-cell-4')); // O
      await fireEvent.press(getByTestId('tictactoe-cell-2')); // X wins

      const overlay = await findByTestId('tictactoe-complete');
      expect(within(overlay).getByText('Sam wins! 🎉')).toBeTruthy();
      expect(await findByTestId('tictactoe-retry')).toBeTruthy();
      expect(await findByTestId('tictactoe-menu')).toBeTruthy();
      expect(playCorrectSound).toHaveBeenCalledTimes(1);
      expect(playWrongSound).not.toHaveBeenCalled();
    });

    it('Play Again resets the board to a fresh, empty game', async () => {
      const { getByTestId, findByTestId, queryByTestId } = await renderGame({ mode: 'friend' });

      await fireEvent.press(getByTestId('tictactoe-cell-0'));
      await fireEvent.press(getByTestId('tictactoe-cell-3'));
      await fireEvent.press(getByTestId('tictactoe-cell-1'));
      await fireEvent.press(getByTestId('tictactoe-cell-4'));
      await fireEvent.press(getByTestId('tictactoe-cell-2'));
      await findByTestId('tictactoe-complete');

      await fireEvent.press(getByTestId('tictactoe-retry'));

      await waitFor(() => expect(queryByTestId('tictactoe-complete')).toBeNull());
      for (let i = 0; i < 9; i++) {
        expect(cellValue(queryByTestId, i)).toBeNull();
      }
    });

    it('Menu calls onMenu', async () => {
      const onMenu = jest.fn();
      const { getByTestId, findByTestId } = await renderGame({ mode: 'friend', onMenu });

      await fireEvent.press(getByTestId('tictactoe-cell-0'));
      await fireEvent.press(getByTestId('tictactoe-cell-3'));
      await fireEvent.press(getByTestId('tictactoe-cell-1'));
      await fireEvent.press(getByTestId('tictactoe-cell-4'));
      await fireEvent.press(getByTestId('tictactoe-cell-2'));
      await findByTestId('tictactoe-complete');

      await fireEvent.press(getByTestId('tictactoe-menu'));
      expect(onMenu).toHaveBeenCalledTimes(1);
    });

    // Regression test for iteration 8: the shared CelebrationOverlay's Modal
    // had no onRequestClose, so Android's back press was captured by the
    // modal's own window and silently dropped while the game-over panel was
    // up — on a headerShown:false screen where back is the child's only way
    // out. Back now goes exactly where the visible "Change setup" button
    // goes, and shares its one-exit-per-presentation latch so it cannot
    // double-fire with a tap on "Play Again".
    it('routes the Android back button on the game-over panel to onMenu', async () => {
      const onMenu = jest.fn();
      const { getByTestId, findByTestId } = await renderGame({ mode: 'friend', onMenu });

      await fireEvent.press(getByTestId('tictactoe-cell-0'));
      await fireEvent.press(getByTestId('tictactoe-cell-3'));
      await fireEvent.press(getByTestId('tictactoe-cell-1'));
      await fireEvent.press(getByTestId('tictactoe-cell-4'));
      await fireEvent.press(getByTestId('tictactoe-cell-2'));

      const overlay = await findByTestId('tictactoe-complete');
      expect(overlay.props.onRequestClose).toBeDefined();
      await act(async () => {
        overlay.props.onRequestClose();
      });

      expect(onMenu).toHaveBeenCalledTimes(1);
    });

    // Regression test: the game-over panel's 'X' used to reuse the same
    // onRequestClose wiring as Android back, so tapping it silently
    // navigated back to the setup screen instead of just closing the panel.
    it("closes the game-over panel via its 'X' without calling onMenu or resetting the board", async () => {
      const onMenu = jest.fn();
      const { getByTestId, findByTestId, queryByTestId } = await renderGame({ mode: 'friend', onMenu });

      await fireEvent.press(getByTestId('tictactoe-cell-0'));
      await fireEvent.press(getByTestId('tictactoe-cell-3'));
      await fireEvent.press(getByTestId('tictactoe-cell-1'));
      await fireEvent.press(getByTestId('tictactoe-cell-4'));
      await fireEvent.press(getByTestId('tictactoe-cell-2'));

      await findByTestId('tictactoe-complete');
      await fireEvent.press(getByTestId('celebration-overlay-close'));

      expect(queryByTestId('tictactoe-complete')).toBeNull();
      expect(onMenu).not.toHaveBeenCalled();
      // The finished board underneath is untouched.
      expect(cellValue(queryByTestId, 0)).toBe('X');
      expect(cellValue(queryByTestId, 1)).toBe('X');
      expect(cellValue(queryByTestId, 2)).toBe('X');
    });

    it('declares a draw when the board fills with no winner', async () => {
      const { getByTestId, findByTestId } = await renderGame({ mode: 'friend' });

      // A known non-winning fill (verified by hand against every winning
      // combination):
      // X O X
      // X O O
      // O X X
      const order = [0, 1, 2, 4, 3, 5, 7, 6, 8];
      for (const index of order) {
        await fireEvent.press(getByTestId(`tictactoe-cell-${index}`));
      }

      const overlay = await findByTestId('tictactoe-complete');
      expect(within(overlay).getByText("It's a draw!")).toBeTruthy();
      // A draw is neither a win nor a loss -- it plays no sound at all
      // rather than guessing which one fits.
      expect(playCorrectSound).not.toHaveBeenCalled();
      expect(playWrongSound).not.toHaveBeenCalled();
    });
  });

  // Regression tests for the premium-polish accessibility pass: cells
  // previously had no accessibilityRole/Label at all (empty cells were a
  // total screen-reader dead end; filled cells were only semi-usable via
  // RN's implicit Text-child naming, with no row/column context).
  describe('cell accessibility', () => {
    it('gives every empty cell a role and a distinct row/column label', async () => {
      const { getByTestId } = await renderGame({ mode: 'friend' });

      expect(getByTestId('tictactoe-cell-0').props.accessibilityRole).toBe('button');
      expect(getByTestId('tictactoe-cell-0').props.accessibilityLabel).toBe('Row 1, column 1, empty');
      expect(getByTestId('tictactoe-cell-4').props.accessibilityLabel).toBe('Row 2, column 2, empty');
      expect(getByTestId('tictactoe-cell-8').props.accessibilityLabel).toBe('Row 3, column 3, empty');
    });

    it('updates a cell\'s label to include its mark once filled, and marks it disabled', async () => {
      const { getByTestId } = await renderGame({ mode: 'friend' });

      await fireEvent.press(getByTestId('tictactoe-cell-0'));

      expect(getByTestId('tictactoe-cell-0').props.accessibilityLabel).toBe('Row 1, column 1, X');
      expect(getByTestId('tictactoe-cell-0').props.accessibilityState).toEqual({ disabled: true });
      // An untouched cell remains enabled and unlabeled-as-filled.
      expect(getByTestId('tictactoe-cell-1').props.accessibilityState).toEqual({ disabled: false });
    });

    it('marks every cell disabled once the game is over, even ones that were never played', async () => {
      const { getByTestId, findByTestId } = await renderGame({ mode: 'friend' });

      await fireEvent.press(getByTestId('tictactoe-cell-0')); // X
      await fireEvent.press(getByTestId('tictactoe-cell-3')); // O
      await fireEvent.press(getByTestId('tictactoe-cell-1')); // X
      await fireEvent.press(getByTestId('tictactoe-cell-4')); // O
      await fireEvent.press(getByTestId('tictactoe-cell-2')); // X wins
      await findByTestId('tictactoe-complete');

      // Cells 5-8 were never tapped, but the game is over — none should
      // read as tappable to a screen-reader user any more.
      expect(getByTestId('tictactoe-cell-8').props.accessibilityState).toEqual({ disabled: true });
    });
  });

  // Regression test for a real, screenshot-confirmed bug: the board used to
  // be a single flexDirection:'row', flexWrap:'wrap' container over all 9
  // cells, relying on Yoga to break a new line after exactly 3 cells. Since
  // each cell's width is boardSize/3 (routinely fractional), the third
  // column wrapped early on a real device, rendering as one solid strip of
  // the board's own background color instead of three bordered cells (same
  // failure class PuzzleScreen.tsx's own grid already fixed the same way).
  // Explicit per-row containers make each row's cell count independent of
  // any floating-point width comparison.
  describe('board grid layout', () => {
    it('lays out exactly 3 cells per row, in 3 explicit row containers, not relying on flexWrap', async () => {
      const { getByTestId } = await renderGame({ mode: 'friend' });

      for (let rowIndex = 0; rowIndex < 3; rowIndex++) {
        const row = getByTestId(`tictactoe-row-${rowIndex}`);
        const cellsInRow = within(row).getAllByRole('button');
        expect(cellsInRow).toHaveLength(3);
        // Each row holds exactly the 3 cells it's meant to (0-2, 3-5, 6-8),
        // never a cell that belongs to a different row.
        for (let colIndex = 0; colIndex < 3; colIndex++) {
          const expectedIndex = rowIndex * 3 + colIndex;
          expect(within(row).getByTestId(`tictactoe-cell-${expectedIndex}`)).toBeTruthy();
        }
      }
    });
  });

  describe('persistent who-is-X/who-is-O labels', () => {
    it('shows the child and friend names against their marks in friend mode', async () => {
      // Math.random pinned to 0 in beforeEach => childIsX is true => child is X.
      const { getByTestId } = await renderGame({ mode: 'friend', childName: 'Sam', friendName: 'Alex' });

      expect(within(getByTestId('tictactoe-player-x')).getByText('Sam')).toBeTruthy();
      expect(within(getByTestId('tictactoe-player-o')).getByText('Alex')).toBeTruthy();
    });

    it('shows "You" and "Computer" against the marks in computer mode', async () => {
      // Math.random pinned to 0 => childIsX true => child (You) is X, Computer is O.
      const { getByTestId } = await renderGame({ mode: 'computer', difficulty: 'easy' });

      expect(within(getByTestId('tictactoe-player-x')).getByText('You')).toBeTruthy();
      expect(within(getByTestId('tictactoe-player-o')).getByText('Computer')).toBeTruthy();
    });

    it('flips which name is X vs O when the coin flip favors the opponent', async () => {
      (Math.random as jest.Mock).mockReturnValue(0.9); // childIsX = false
      const { getByTestId } = await renderGame({ mode: 'computer', difficulty: 'easy' });

      expect(within(getByTestId('tictactoe-player-x')).getByText('Computer')).toBeTruthy();
      expect(within(getByTestId('tictactoe-player-o')).getByText('You')).toBeTruthy();
    });
  });

  describe('computer mode', () => {
    it('lets the human (X) move first, then triggers a computer (O) move automatically', async () => {
      jest.useFakeTimers();
      const { getByTestId, queryByTestId } = await renderGame({ mode: 'computer', difficulty: 'hard' });

      await act(async () => {
        fireEvent.press(getByTestId('tictactoe-cell-0'));
      });
      expect(cellValue(queryByTestId, 0)).toBe('X');
      expect(getByTestId('tictactoe-status').props.children).toBe('Computer is thinking...');

      await act(async () => {
        jest.advanceTimersByTime(600);
      });

      const filledCount = Array.from({ length: 9 }, (_, i) => cellValue(queryByTestId, i)).filter(Boolean).length;
      expect(filledCount).toBe(2);
      // "Your turn" was replaced with the child's real name for consistency
      // with friend mode's own naming (per renderGame's default childName).
      expect(getByTestId('tictactoe-status').props.children).toBe("Sam's turn");

      jest.useRealTimers();
    });

    it("blocks a tap during the computer's thinking delay", async () => {
      jest.useFakeTimers();
      const { getByTestId, queryByTestId } = await renderGame({ mode: 'computer', difficulty: 'hard' });

      await act(async () => {
        fireEvent.press(getByTestId('tictactoe-cell-0'));
      });
      // Attempt to tap another cell while the computer "thinks" — must be ignored.
      await act(async () => {
        fireEvent.press(getByTestId('tictactoe-cell-1'));
      });

      const filledBeforeTimer = Array.from({ length: 9 }, (_, i) => cellValue(queryByTestId, i)).filter(
        Boolean
      ).length;
      expect(filledBeforeTimer).toBe(1);

      await act(async () => {
        jest.advanceTimersByTime(600);
      });
      jest.useRealTimers();
    });

    it('an unbeatable ("hard") computer never loses a full game', async () => {
      jest.useFakeTimers();
      const { getByTestId, queryByTestId } = await renderGame({ mode: 'computer', difficulty: 'hard' });

      // Play a fixed, deliberately non-optimal human sequence and let the
      // computer respond after each move; the hard AI (ported minimax) must
      // never end up with a human ('X') win.
      const humanMoves = [4, 0, 2, 6, 8];
      for (const index of humanMoves) {
        if (queryByTestId('tictactoe-complete')) break;
        if (cellValue(queryByTestId, index) !== null) continue;
        await act(async () => {
          fireEvent.press(getByTestId(`tictactoe-cell-${index}`));
        });
        await act(async () => {
          jest.advanceTimersByTime(600);
        });
      }

      const status = getByTestId('tictactoe-status').props.children as string;
      expect(status).not.toBe('You win! 🎉');
      jest.useRealTimers();
    });

    // Regression test for the premium-polish child-delight pass: the
    // computer beating the child previously fired the exact same confetti/
    // success styling as the child winning — a loss shouldn't be styled as
    // a triumph. Forces a specific computer win by scripting its moves
    // (via the mocked getComputerMove) rather than relying on the human
    // player to lose against the real minimax, which the AI is specifically
    // designed never to allow.
    it('does NOT use success tone/confetti when the computer wins, and shows an encouraging message instead', async () => {
      jest.useFakeTimers();
      (getComputerMove as jest.Mock)
        .mockReturnValueOnce(0) // O: top-left
        .mockReturnValueOnce(1) // O: top-middle
        .mockReturnValueOnce(2); // O: top-right -> completes the top row
      const { getByTestId, findByTestId } = await renderGame({ mode: 'computer', difficulty: 'hard' });

      // Human (X) plays cells that never block the top row the computer is
      // building: 3, 6, 7.
      for (const index of [3, 6, 7]) {
        await act(async () => {
          fireEvent.press(getByTestId(`tictactoe-cell-${index}`));
        });
        await act(async () => {
          jest.advanceTimersByTime(600);
        });
      }

      const overlay = await findByTestId('tictactoe-complete');
      expect(within(overlay).getByText('Computer wins')).toBeTruthy();
      expect(within(overlay).getByText('Good try! Want to play again?')).toBeTruthy();
      // No celebration bubble/emoji for a computer win — that's the
      // success-only flourish CelebrationOverlay renders when `tone`
      // is 'success' AND an `emoji` is provided.
      expect(within(overlay).queryByTestId('celebration-bubble')).toBeNull();
      expect(playWrongSound).toHaveBeenCalledTimes(1);
      expect(playCorrectSound).not.toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  // Regression tests for a real bug: whose turn it was used to live in its
  // own `currentPlayer` state updated by hand next to every setBoard, and
  // the next board was built from the `board` of the render the tap's
  // handler was created in. React Native hands JS a BATCH of queued touch
  // events at once, so two taps landing close together (a 2-8 year old
  // drumming on the board, or a stray second finger) both ran against that
  // same pre-update render — and the second one rebuilt the board from the
  // stale copy, erasing the first tap's mark entirely. Both taps are
  // reproduced here inside a single act(), which is exactly that batch.
  describe('two taps delivered in a single batch (a child drumming on the board)', () => {
    // React logs "overlapping act() calls" for the deliberately-nested
    // act below — that nesting IS the batch being reproduced, so the
    // warning is expected noise here rather than a signal. Same
    // spy-and-restore idiom as ColoringScreen's own console tests.
    function silenceOverlappingActWarning() {
      return jest.spyOn(console, 'error').mockImplementation(() => {});
    }

    it('friend mode: both taps land, and the first one is not wiped out by the second', async () => {
      silenceOverlappingActWarning();
      const { getByTestId, queryByTestId } = await renderGame({ mode: 'friend' });

      const firstCell = getByTestId('tictactoe-cell-0');
      const secondCell = getByTestId('tictactoe-cell-1');
      await act(async () => {
        fireEvent.press(firstCell);
        fireEvent.press(secondCell);
      });

      // Sam's X must still be there; Alex's O is the second tap.
      expect(cellValue(queryByTestId, 0)).toBe('X');
      expect(cellValue(queryByTestId, 1)).toBe('O');
      // ...and the turn is back to Sam, matching the two marks on the board.
      expect(getByTestId('tictactoe-status').props.children).toBe("Sam's turn");
    });

    it("computer mode: a batched second tap never places the computer's mark for it", async () => {
      jest.useFakeTimers();
      silenceOverlappingActWarning();
      const { getByTestId, queryByTestId } = await renderGame({ mode: 'computer', difficulty: 'hard' });

      const firstCell = getByTestId('tictactoe-cell-0');
      const secondCell = getByTestId('tictactoe-cell-1');
      await act(async () => {
        fireEvent.press(firstCell);
        fireEvent.press(secondCell);
      });

      // Exactly the child's own single move — the extra tap must not have
      // let the child play the computer's side, nor erased their own move.
      expect(cellValue(queryByTestId, 0)).toBe('X');
      expect(cellValue(queryByTestId, 1)).toBeNull();

      // The computer still gets its normal turn afterwards.
      await act(async () => {
        jest.advanceTimersByTime(600);
      });
      const filled = Array.from({ length: 9 }, (_, i) => cellValue(queryByTestId, i)).filter(Boolean).length;
      expect(filled).toBe(2);

      jest.useRealTimers();
    });
  });

  // Regression tests for a real, reported issue: the app's own child always
  // started (as X) every single game — computer mode and friend mode alike
  // — which the child hunting this loop was explicitly asked to make a real
  // 50/50 coin flip instead, re-rolled fresh on every game/Retry.
  describe('random starting player', () => {
    it('lets the opponent (computer) start as X when the coin flip lands the other way', async () => {
      jest.restoreAllMocks(); // undo this file's own beforeEach pin for this one test
      jest.spyOn(Math, 'random').mockReturnValue(0.99); // childIsX = false
      jest.useFakeTimers();
      (getComputerMove as jest.Mock).mockReturnValueOnce(0);

      const { getByTestId, queryByTestId } = await renderGame({ mode: 'computer', difficulty: 'hard' });

      // The computer (X this game) moves automatically without any tap at
      // all, since it's not waiting on the child.
      await act(async () => {
        jest.advanceTimersByTime(600);
      });

      expect(cellValue(queryByTestId, 0)).toBe('X');
      expect(getByTestId('tictactoe-status').props.children).toBe("Sam's turn");

      jest.useRealTimers();
    });

    // Integration coverage for the wiring behind the real engine bug this
    // feature surfaced (see ticTacToeEngine.ts's own computerMark parameter
    // and its dedicated tests, which DO independently fail without the fix
    // — confirmed via git stash): plays out a full, REAL (non-mocked)
    // unbeatable-difficulty game where the computer starts first as X,
    // mirroring the existing all-'O' version of this same test above.
    // Note: this particular human move sequence does not, by itself,
    // discriminate a forgotten computerMark argument here (a manual check
    // confirmed it still passes even without passing computerMark through)
    // — the engine-level tests are what actually prove the fix; this test
    // exists to confirm the full screen-level flow (auto-first-move,
    // continued play, no crash) behaves sensibly when the computer starts.
    it('an unbeatable ("hard") computer never loses a full game when it starts first as X', async () => {
      jest.restoreAllMocks();
      jest.spyOn(Math, 'random').mockReturnValue(0.99); // childIsX = false: computer is X, starts first
      jest.useFakeTimers();

      const { getByTestId, queryByTestId } = await renderGame({ mode: 'computer', difficulty: 'hard' });

      // Computer (X) moves automatically first, before any human tap.
      await act(async () => {
        jest.advanceTimersByTime(600);
      });

      // Human (now O this game) plays a fixed, deliberately non-optimal
      // sequence — same shape as the all-'O' version of this test.
      const humanMoves = [4, 0, 2, 6, 8];
      for (const index of humanMoves) {
        if (queryByTestId('tictactoe-complete')) break;
        if (cellValue(queryByTestId, index) !== null) continue;
        await act(async () => {
          fireEvent.press(getByTestId(`tictactoe-cell-${index}`));
        });
        await act(async () => {
          jest.advanceTimersByTime(600);
        });
      }

      const status = getByTestId('tictactoe-status').props.children as string;
      expect(status).not.toBe('You win! 🎉');
      jest.useRealTimers();
    });

    it('lets the friend start as X when the coin flip lands the other way', async () => {
      jest.restoreAllMocks();
      jest.spyOn(Math, 'random').mockReturnValue(0.99); // childIsX = false

      const { getByTestId, queryByTestId } = await renderGame({ mode: 'friend' });

      // Sam (the child) is O this game, so the FIRST tap (always marked X
      // by the engine) is really Alex's (the friend's) move.
      expect(getByTestId('tictactoe-status').props.children).toBe("Alex's turn");

      await fireEvent.press(getByTestId('tictactoe-cell-0'));
      expect(cellValue(queryByTestId, 0)).toBe('X');
      expect(getByTestId('tictactoe-status').props.children).toBe("Sam's turn");
    });

    it('re-rolls a fresh coin flip on Retry, not the same starting player every game', async () => {
      const randomSpy = jest.spyOn(Math, 'random');
      randomSpy.mockReturnValueOnce(0); // game 1: childIsX = true
      randomSpy.mockReturnValueOnce(0.99); // Retry's re-roll: childIsX = false

      const { getByTestId, findByTestId, queryByTestId } = await renderGame({ mode: 'friend' });
      expect(getByTestId('tictactoe-status').props.children).toBe("Sam's turn");

      // Sam (X) wins the top row; Alex (O) plays elsewhere.
      await fireEvent.press(getByTestId('tictactoe-cell-0')); // X (Sam)
      await fireEvent.press(getByTestId('tictactoe-cell-3')); // O (Alex)
      await fireEvent.press(getByTestId('tictactoe-cell-1')); // X (Sam)
      await fireEvent.press(getByTestId('tictactoe-cell-4')); // O (Alex)
      await fireEvent.press(getByTestId('tictactoe-cell-2')); // X (Sam) wins
      await findByTestId('tictactoe-complete');

      await fireEvent.press(getByTestId('tictactoe-retry'));
      await waitFor(() => expect(queryByTestId('tictactoe-complete')).toBeNull());

      // Second game's coin flip landed childIsX = false — the first tap
      // (always X) is now Alex's move, not Sam's.
      expect(getByTestId('tictactoe-status').props.children).toBe("Alex's turn");
    });
  });
});

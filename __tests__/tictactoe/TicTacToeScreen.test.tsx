import React from 'react';
import { render, fireEvent, waitFor, act, within } from '@testing-library/react-native';
import { TicTacToeScreen } from '../../src/tictactoe/TicTacToeScreen';
import { LanguageProvider } from '../../src/i18n/LanguageContext';
import { getComputerMove } from '../../src/tictactoe/ticTacToeEngine';

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
      <TicTacToeScreen mode={props.mode ?? 'friend'} difficulty={props.difficulty ?? null} onMenu={onMenu} />
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
  describe('friend mode (no computer involved)', () => {
    it('starts with an empty board and X to move first', async () => {
      const { queryByTestId, getByTestId } = await renderGame({ mode: 'friend' });

      for (let i = 0; i < 9; i++) {
        expect(cellValue(queryByTestId, i)).toBeNull();
      }
      expect(getByTestId('tictactoe-status').props.children).toBe('Your turn');
    });

    it('alternates X and O as cells are tapped', async () => {
      const { getByTestId, queryByTestId } = await renderGame({ mode: 'friend' });

      await fireEvent.press(getByTestId('tictactoe-cell-0'));
      expect(cellValue(queryByTestId, 0)).toBe('X');
      expect(getByTestId('tictactoe-status').props.children).toBe("Friend's turn");

      await fireEvent.press(getByTestId('tictactoe-cell-1'));
      expect(cellValue(queryByTestId, 1)).toBe('O');
      expect(getByTestId('tictactoe-status').props.children).toBe('Your turn');
    });

    it('does not let a player overwrite an already-filled cell', async () => {
      const { getByTestId, queryByTestId } = await renderGame({ mode: 'friend' });

      await fireEvent.press(getByTestId('tictactoe-cell-0')); // X
      await fireEvent.press(getByTestId('tictactoe-cell-0')); // still X's cell, O tries and fails

      expect(cellValue(queryByTestId, 0)).toBe('X');
      expect(getByTestId('tictactoe-status').props.children).toBe("Friend's turn");
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
      expect(within(overlay).getByText('Player X wins! 🎉')).toBeTruthy();
      expect(await findByTestId('tictactoe-retry')).toBeTruthy();
      expect(await findByTestId('tictactoe-menu')).toBeTruthy();
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
      expect(getByTestId('tictactoe-status').props.children).toBe('Your turn');

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

      jest.useRealTimers();
    });
  });
});

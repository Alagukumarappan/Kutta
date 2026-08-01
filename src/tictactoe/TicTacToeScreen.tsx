import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageContext';
import { tFormat } from '../i18n/strings';
import {
  createEmptyBoard,
  getGameStatus,
  getComputerMove,
  HUMAN_PLAYER,
  COMPUTER_PLAYER,
  type Board,
  type Player,
  type Difficulty,
} from './ticTacToeEngine';
import type { TicTacToeMode } from './TicTacToeSetupScreen';
import {
  colors,
  radii,
  spacing,
  typography,
  elevation,
  clamp,
  getActivityPalette,
  CelebrationOverlay,
} from '../design-system';

const PALETTE = getActivityPalette('tictactoe');

// Same 200ms pacing the source Angular algorithm used before playing the
// computer's move (see ticTacToeEngine.ts's port notes) — purely a UX beat
// so the move doesn't feel instantaneous/robotic, not part of the algorithm
// itself.
const COMPUTER_MOVE_DELAY_MS = 500;

export function TicTacToeScreen({
  mode,
  difficulty,
  onMenu,
}: {
  mode: TicTacToeMode;
  // Only meaningful when mode === 'computer'; ignored for 'friend'.
  difficulty: Difficulty | null;
  onMenu: () => void;
}) {
  const { t, language } = useLanguage();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  const [board, setBoard] = useState<Board>(createEmptyBoard);
  const [currentPlayer, setCurrentPlayer] = useState<Player>(HUMAN_PLAYER);

  const status = getGameStatus(board);
  const isGameOver = status.status !== 'in-progress';

  // Double-fire guards for the completion overlay's two buttons — same
  // idiom as PuzzleScreen's retryFiredRef/nextFiredRef.
  const retryFiredRef = useRef(false);
  const menuFiredRef = useRef(false);
  useEffect(() => {
    if (isGameOver) {
      retryFiredRef.current = false;
      menuFiredRef.current = false;
    }
  }, [isGameOver]);

  // The computer only ever plays as O, and only in 'computer' mode — see
  // ticTacToeEngine.ts's HUMAN_PLAYER/COMPUTER_PLAYER assignment (ported
  // from the source algorithm, which hardcodes the same sides).
  const isComputersTurn = mode === 'computer' && currentPlayer === COMPUTER_PLAYER && !isGameOver;

  useEffect(() => {
    if (!isComputersTurn || difficulty === null) return;
    let cancelled = false;
    const timeoutId = setTimeout(() => {
      if (cancelled) return;
      const move = getComputerMove(board, difficulty);
      if (move === null) return;
      setBoard((prev) => {
        const next = prev.slice();
        next[move] = COMPUTER_PLAYER;
        return next;
      });
      setCurrentPlayer(HUMAN_PLAYER);
    }, COMPUTER_MOVE_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isComputersTurn]);

  function handleCellPress(index: number) {
    if (isGameOver || board[index] !== null || isComputersTurn) return;
    const next = board.slice();
    next[index] = currentPlayer;
    setBoard(next);
    setCurrentPlayer(currentPlayer === 'X' ? 'O' : 'X');
  }

  function handleRetry() {
    if (retryFiredRef.current) return;
    retryFiredRef.current = true;
    setBoard(createEmptyBoard());
    setCurrentPlayer(HUMAN_PLAYER);
  }

  function handleMenu() {
    if (menuFiredRef.current) return;
    menuFiredRef.current = true;
    onMenu();
  }

  function statusText(): string {
    if (status.status === 'won') {
      if (mode === 'computer') {
        return status.winner === HUMAN_PLAYER ? t('tictactoeYouWin') : t('tictactoeComputerWins');
      }
      return status.winner === 'X' ? t('tictactoePlayerXWins') : t('tictactoePlayerOWins');
    }
    if (status.status === 'draw') return t('tictactoeDraw');
    if (mode === 'computer') {
      return currentPlayer === HUMAN_PLAYER ? t('tictactoeYourTurn') : t('tictactoeComputerTurn');
    }
    return currentPlayer === 'X' ? t('tictactoeYourTurn') : t('tictactoeFriendTurn');
  }

  // A square board sized to comfortably fit the shorter of the available
  // width/height, same "fit within the smaller dimension" idea as
  // PuzzleScreen's board sizing, just simpler since every tic-tac-toe cell
  // is always a plain square (no photo aspect ratio to account for).
  const availableWidth = width - insets.left - insets.right - spacing.lg * 2;
  const availableHeight = height - insets.top - insets.bottom - 160;
  const boardSize = clamp(Math.min(availableWidth, availableHeight), 180, 360);
  const cellSize = boardSize / 3;

  const winningLine = status.status === 'won' ? status.line : null;
  // Previously every win — including the computer beating the child —
  // fired the same success tone, confetti emoji, and celebratory styling.
  // A friend-mode win (either child wins) or the child beating the
  // computer both deserve that; the computer beating the child is a loss
  // for the human player and shouldn't be styled as a triumph. Only that
  // one specific case gets a calmer, encouraging message instead.
  const isHumanLoss = mode === 'computer' && status.status === 'won' && status.winner === COMPUTER_PLAYER;
  const isCelebratoryWin = status.status === 'won' && !isHumanLoss;

  return (
    <View
      style={[
        styles.screen,
        {
          paddingTop: spacing.md + insets.top,
          paddingBottom: spacing.md + insets.bottom,
          paddingLeft: spacing.md + insets.left,
          paddingRight: spacing.md + insets.right,
        },
      ]}
    >
      <Text testID="tictactoe-status" style={styles.statusText}>
        {statusText()}
      </Text>

      <View style={[styles.board, { width: boardSize, height: boardSize }, elevation.level4]}>
        {/* Explicit row-by-row rendering instead of a single flexWrap:'wrap'
            container over all 9 cells: relying on Yoga to "naturally" break
            a line after exactly 3 cells depends on 3*cellSize landing on the
            exact right side of Yoga's strict `>` float comparison against
            the board's width - cellSize (boardSize / 3) is routinely
            fractional, so this wrapped the 3rd column early in practice
            (confirmed via a real-device screenshot: the third column
            rendered as one solid strip of the board's own background color
            instead of three bordered cells). Same fix PuzzleScreen.tsx
            already uses for its own grid, for the same reason. */}
        {[0, 1, 2].map((rowIndex) => (
          <View key={rowIndex} testID={`tictactoe-row-${rowIndex}`} style={styles.boardRow}>
            {[0, 1, 2].map((colIndex) => {
              const index = rowIndex * 3 + colIndex;
              const cell = board[index];
              const isWinningCell = winningLine?.includes(index) ?? false;
              // Empty cells previously had no accessibilityRole/Label at all —
              // a screen-reader user had no way to tell which of the 9 squares
              // they were about to tap (occupied cells were only semi-usable,
              // since RN implicitly reads the "X"/"O" Text child as a name with
              // no row/column context). Both cases now get an explicit,
              // positional label; accessibilityState communicates when a cell
              // genuinely can't be tapped right now (game over, already filled,
              // or the computer is "thinking"), mirroring handleCellPress's own
              // guard below.
              const row = rowIndex + 1;
              const column = colIndex + 1;
              const cellLabel = cell
                ? tFormat('tictactoeCellFilledLabel', language, { row, column, mark: cell })
                : tFormat('tictactoeCellEmptyLabel', language, { row, column });
              return (
                <Pressable
                  key={index}
                  testID={`tictactoe-cell-${index}`}
                  onPress={() => handleCellPress(index)}
                  accessibilityRole="button"
                  accessibilityLabel={cellLabel}
                  accessibilityState={{ disabled: isGameOver || cell !== null || isComputersTurn }}
                  style={[
                    styles.cell,
                    { width: cellSize, height: cellSize },
                    isWinningCell && styles.cellWinning,
                  ]}
                >
                  {cell && (
                    <Text
                      testID={`tictactoe-cell-${index}-mark`}
                      style={[styles.cellText, cell === 'X' ? styles.cellTextX : styles.cellTextO]}
                    >
                      {cell}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        ))}
      </View>

      <CelebrationOverlay
        visible={isGameOver}
        tone={isCelebratoryWin ? 'success' : 'neutral'}
        emoji={isCelebratoryWin ? '🎉' : undefined}
        title={statusText()}
        message={isHumanLoss ? t('tictactoeTryAgainEncouragement') : undefined}
        testID="tictactoe-complete"
        actions={[
          { label: t('tictactoePlayAgain'), onPress: handleRetry, testID: 'tictactoe-retry' },
          { label: t('tictactoeChangeSetup'), onPress: handleMenu, variant: 'secondary', testID: 'tictactoe-menu' },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusText: {
    fontSize: typography.h3.fontSize,
    fontWeight: typography.h3.fontWeight,
    color: colors.ink,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  board: {
    flexDirection: 'column',
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceSunk,
    borderWidth: 4,
    borderColor: PALETTE.accentDark,
    overflow: 'hidden',
  },
  boardRow: {
    flexDirection: 'row',
  },
  cell: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: PALETTE.accentDark,
    backgroundColor: colors.surface,
  },
  cellWinning: {
    backgroundColor: PALETTE.accentSoft,
  },
  cellText: {
    fontSize: 48,
    fontWeight: '900',
  },
  cellTextX: {
    color: colors.bubblegumDark,
  },
  cellTextO: {
    color: PALETTE.accentDark,
  },
});

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../i18n/LanguageContext';
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
  const { t } = useLanguage();
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
        {board.map((cell, index) => {
          const isWinningCell = winningLine?.includes(index) ?? false;
          return (
            <Pressable
              key={index}
              testID={`tictactoe-cell-${index}`}
              onPress={() => handleCellPress(index)}
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

      <CelebrationOverlay
        visible={isGameOver}
        tone={status.status === 'won' ? 'success' : 'neutral'}
        emoji={status.status === 'won' ? '🎉' : undefined}
        title={statusText()}
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: radii.lg,
    backgroundColor: colors.surfaceSunk,
    borderWidth: 4,
    borderColor: PALETTE.accentDark,
    overflow: 'hidden',
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

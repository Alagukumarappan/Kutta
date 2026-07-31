import React from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { colors, radii, spacing, shadow } from '../theme/tokens';
import { computeGridDimensions } from '../puzzle/puzzleGrid';

const PIECE_COUNT_OPTIONS = [4, 6, 9, 12] as const;

// A tiny rows x cols dot-grid rendered inside each option, so a pre-reader
// can recognize "this one has more/smaller pieces" by eye rather than by
// reading the number.
function MiniGrid({ count, isPortrait }: { count: 4 | 6 | 9 | 12; isPortrait: boolean }) {
  // The real photo's orientation is already known by the time this picker is
  // shown (PuzzleScreen passes it through as `isPortrait`), so the icon shows
  // the same rows x cols shape the actual board will use, instead of always
  // assuming landscape.
  const { rows, cols } = computeGridDimensions(count, isPortrait);
  return (
    <View style={styles.miniGrid}>
      {Array.from({ length: rows }).map((_, r) => (
        <View key={r} style={styles.miniGridRow}>
          {Array.from({ length: cols }).map((__, c) => (
            <View key={c} style={styles.miniGridCell} />
          ))}
        </View>
      ))}
    </View>
  );
}

// Piece-count picker for the puzzle difficulty choice, following the same
// labeled-Pressable-opens-a-Modal-list pattern as AgePicker (see
// src/components/AgePicker.tsx). Kept as a separate component rather than
// generalizing AgePicker, so Onboarding/Settings' existing, already-tested
// age-picking behavior isn't put at risk by a shared abstraction.
export function PieceCountPicker({
  value,
  onChange,
  visible,
  onOpen,
  onClose,
  placeholder,
  testIDPrefix,
  isPortrait,
}: {
  value: 4 | 6 | 9 | 12 | null;
  onChange: (count: 4 | 6 | 9 | 12) => void;
  visible: boolean;
  onOpen: () => void;
  onClose: () => void;
  placeholder: string;
  testIDPrefix: string;
  isPortrait: boolean;
}) {
  return (
    <>
      <Pressable testID={`${testIDPrefix}-picker`} onPress={onOpen} style={styles.field}>
        {value !== null && <MiniGrid count={value} isPortrait={isPortrait} />}
        <Text style={value === null ? styles.placeholder : styles.value}>
          {value === null ? placeholder : String(value)}
        </Text>
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable style={styles.modalOverlay} onPress={onClose}>
          <View style={styles.modalCard}>
            {PIECE_COUNT_OPTIONS.map((option) => (
              <Pressable
                key={option}
                testID={`${testIDPrefix}-option-${option}`}
                onPress={() => {
                  onChange(option);
                  onClose();
                }}
                style={styles.optionRow}
              >
                <MiniGrid count={option} isPortrait={isPortrait} />
                <Text style={styles.optionText}>{option}</Text>
              </Pressable>
            ))}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    borderWidth: 3,
    borderColor: colors.mintDark,
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    gap: spacing.xs,
    ...shadow,
    elevation: 3,
  },
  placeholder: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.ink,
  },
  value: {
    fontSize: 26,
    fontWeight: 'bold',
    color: colors.ink,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(45, 49, 66, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.background,
    borderRadius: radii.xl,
    borderWidth: 4,
    borderColor: colors.mintDark,
    padding: spacing.sm,
    width: '100%',
    maxWidth: 340,
    gap: spacing.sm,
    ...shadow,
    elevation: 6,
  },
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 2,
    borderColor: colors.mintDark,
    backgroundColor: colors.white,
    gap: spacing.md,
    ...shadow,
    elevation: 2,
  },
  optionText: {
    fontSize: 26,
    fontWeight: 'bold',
    color: colors.ink,
  },
  miniGrid: {
    gap: 3,
  },
  miniGridRow: {
    flexDirection: 'row',
    gap: 3,
  },
  miniGridCell: {
    width: 12,
    height: 12,
    borderRadius: 3,
    backgroundColor: colors.mint,
    borderWidth: 1,
    borderColor: colors.mintDark,
  },
});

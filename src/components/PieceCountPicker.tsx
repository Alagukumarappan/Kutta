import React from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { colors, radii, spacing, shadow } from '../theme/tokens';

const PIECE_COUNT_OPTIONS = [4, 6, 9, 12] as const;

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
}: {
  value: 4 | 6 | 9 | 12 | null;
  onChange: (count: 4 | 6 | 9 | 12) => void;
  visible: boolean;
  onOpen: () => void;
  onClose: () => void;
  placeholder: string;
  testIDPrefix: string;
}) {
  return (
    <>
      <Pressable testID={`${testIDPrefix}-picker`} onPress={onOpen} style={styles.field}>
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
    borderWidth: 2,
    borderColor: colors.disabledBorder,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
  },
  placeholder: {
    fontSize: 18,
    color: colors.disabledText,
  },
  value: {
    fontSize: 22,
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
    backgroundColor: colors.white,
    borderRadius: radii.lg,
    padding: spacing.sm,
    width: '100%',
    maxWidth: 320,
    ...shadow,
    elevation: 4,
  },
  optionRow: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    alignItems: 'center',
  },
  optionText: {
    fontSize: 22,
    fontWeight: 'bold',
    color: colors.ink,
  },
});

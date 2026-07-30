import React from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { colors, radii, spacing, shadow } from '../theme/tokens';

const AGE_OPTIONS = [2, 3, 4, 5, 6, 7, 8] as const;

// Shared age-selection control used by both Onboarding and Settings, so a
// parent sees the exact same picker interaction wherever a child's age is
// entered. `testIDPrefix` lets each screen keep its own testID namespace,
// e.g. "onboarding-age" -> "onboarding-age-picker" / "onboarding-age-option-4",
// "settings-age" -> "settings-age-picker" / "settings-age-option-4".
export function AgePicker({
  value,
  onChange,
  visible,
  onOpen,
  onClose,
  placeholder,
  testIDPrefix,
}: {
  value: number | null;
  onChange: (age: number) => void;
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
            {AGE_OPTIONS.map((option) => (
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

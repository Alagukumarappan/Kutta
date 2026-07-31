import React from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { colors, radii, spacing, shadow } from '../theme/tokens';
import { colors as dsColors, radii as dsRadii, elevation as dsElevation } from '../design-system/tokens';
import type { Language } from '../types/profile';

// The full set of selectable languages, in display order — a single list
// both Onboarding and Settings render from, so adding a third language later
// is a one-line change here rather than a UI redesign in either screen (the
// previous two-button layout would have needed a third button hand-added to
// both screens).
export const LANGUAGE_OPTIONS: ReadonlyArray<{ code: Language; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'de', label: 'Deutsch' },
];

// Shared language-selection control used by both Onboarding and Settings, so
// a parent sees the same dropdown interaction wherever the app's language is
// chosen — mirrors AgePicker's own shared-component/variant-prop pattern in
// this same directory. `testIDPrefix` namespaces testIDs per screen, e.g.
// "onboarding-lang" -> "onboarding-lang-picker" / "onboarding-lang-option-en",
// "settings-lang" -> "settings-lang-picker" / "settings-lang-option-en".
//
// `variant` picks which existing palette the closed field and option list
// render in: "playful" for Onboarding's candy/aurora look (violet accent,
// matching AgePicker's own "playful" variant), "parent" for Settings' calmer
// parent-facing palette (colors.parent.*, matching that screen's other
// controls).
export function LanguageSelector({
  value,
  onChange,
  visible,
  onOpen,
  onClose,
  testIDPrefix,
  variant,
}: {
  value: Language;
  onChange: (language: Language) => void;
  visible: boolean;
  onOpen: () => void;
  onClose: () => void;
  testIDPrefix: string;
  variant: 'playful' | 'parent';
}) {
  const playful = variant === 'playful';
  const selected = LANGUAGE_OPTIONS.find((option) => option.code === value);

  return (
    <>
      <Pressable
        testID={`${testIDPrefix}-picker`}
        onPress={onOpen}
        style={[styles.field, playful ? playfulStyles.field : parentStyles.field]}
        hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
        accessibilityRole="button"
        accessibilityLabel={selected?.label ?? value}
      >
        <Text style={[styles.value, playful ? playfulStyles.value : parentStyles.value]}>
          {selected?.label ?? value}
        </Text>
        <Text style={[styles.chevron, playful ? playfulStyles.value : parentStyles.value]}>▾</Text>
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable
          style={[styles.modalOverlay, playful ? playfulStyles.modalOverlay : parentStyles.modalOverlay]}
          onPress={onClose}
        >
          <View style={[styles.modalCard, playful ? playfulStyles.modalCard : parentStyles.modalCard]}>
            {LANGUAGE_OPTIONS.map((option) => {
              const isSelected = option.code === value;
              return (
                <Pressable
                  key={option.code}
                  testID={`${testIDPrefix}-option-${option.code}`}
                  onPress={() => {
                    onChange(option.code);
                    onClose();
                  }}
                  style={[
                    styles.optionRow,
                    isSelected && (playful ? playfulStyles.optionRowSelected : parentStyles.optionRowSelected),
                  ]}
                >
                  <Text
                    style={[
                      styles.optionText,
                      isSelected && (playful ? playfulStyles.optionTextSelected : parentStyles.optionTextSelected),
                    ]}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    borderWidth: 2,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 44,
  },
  value: {
    fontSize: 16,
    fontWeight: '700',
  },
  chevron: {
    fontSize: 14,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  modalCard: {
    width: '100%',
    maxWidth: 320,
    ...shadow,
    elevation: 4,
  },
  optionRow: {
    minHeight: 48,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
  },
  optionText: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.ink,
  },
});

const playfulStyles = StyleSheet.create({
  field: {
    borderColor: dsColors.violetDark,
    borderRadius: dsRadii.lg,
    backgroundColor: dsColors.violetSoft,
  },
  value: {
    color: dsColors.violetDark,
  },
  modalOverlay: {
    backgroundColor: dsColors.overlayScrim,
  },
  modalCard: {
    backgroundColor: dsColors.surface,
    borderRadius: dsRadii.xl,
    padding: spacing.sm,
    ...dsElevation.level4,
  },
  optionRowSelected: {
    backgroundColor: dsColors.violetSoft,
  },
  optionTextSelected: {
    color: dsColors.violetDark,
  },
});

const parentStyles = StyleSheet.create({
  field: {
    borderColor: dsColors.parent.border,
    borderRadius: dsRadii.md,
    backgroundColor: dsColors.parent.background,
  },
  value: {
    color: dsColors.parent.ink,
  },
  modalOverlay: {
    backgroundColor: dsColors.overlayScrim,
  },
  modalCard: {
    backgroundColor: dsColors.parent.surface,
    borderRadius: dsRadii.lg,
    padding: spacing.xs,
  },
  optionRowSelected: {
    backgroundColor: dsColors.parent.accentSoft,
  },
  optionTextSelected: {
    color: dsColors.parent.accentDark,
  },
});

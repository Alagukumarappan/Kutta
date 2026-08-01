import React from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { colors, radii, spacing, shadow } from '../theme/tokens';
import { colors as dsColors, radii as dsRadii, elevation as dsElevation } from '../design-system/tokens';
import { useLanguage } from '../i18n/LanguageContext';
import { tFormat } from '../i18n/strings';

const AGE_OPTIONS = [2, 3, 4, 5, 6, 7, 8] as const;

// Shared age-selection control used by both Onboarding and Settings, so a
// parent sees the exact same picker interaction wherever a child's age is
// entered. `testIDPrefix` lets each screen keep its own testID namespace,
// e.g. "onboarding-age" -> "onboarding-age-picker" / "onboarding-age-option-4",
// "settings-age" -> "settings-age-picker" / "settings-age-option-4".
//
// `variant` ("default" by default) is a purely visual switch: "playful"
// layers the new design-system palette/elevation on top of this SAME
// structure (same testIDs, same hitSlop, same option minHeight) for the
// redesigned OnboardingScreen, while Settings (not redesigned this
// iteration) keeps rendering with the untouched "default" look by simply
// never passing the prop — see REDESIGN_PROGRESS.md's reasoning for why a
// shared component gets a variant switch instead of two forks.
export function AgePicker({
  value,
  onChange,
  visible,
  onOpen,
  onClose,
  placeholder,
  testIDPrefix,
  variant = 'default',
}: {
  value: number | null;
  onChange: (age: number) => void;
  visible: boolean;
  onOpen: () => void;
  onClose: () => void;
  placeholder: string;
  testIDPrefix: string;
  variant?: 'default' | 'playful';
}) {
  const { t, language } = useLanguage();
  const playful = variant === 'playful';
  const fieldLabel = value === null ? placeholder : tFormat('ageOptionLabel', language, { age: value });
  return (
    <>
      <Pressable
        testID={`${testIDPrefix}-picker`}
        onPress={onOpen}
        style={[styles.field, playful && (value === null ? playfulStyles.fieldEmpty : playfulStyles.fieldFilled)]}
        hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
        accessibilityRole="button"
        accessibilityLabel={fieldLabel}
      >
        <Text
          style={[
            value === null ? styles.placeholder : styles.value,
            playful && (value === null ? playfulStyles.placeholder : playfulStyles.value),
          ]}
        >
          {value === null ? placeholder : String(value)}
        </Text>
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable
          testID={`${testIDPrefix}-modal-overlay`}
          style={[styles.modalOverlay, playful && playfulStyles.modalOverlay]}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={t('ageModalCloseLabel')}
        >
          <View style={[styles.modalCard, playful && playfulStyles.modalCard]}>
            {AGE_OPTIONS.map((option) => (
              <Pressable
                key={option}
                testID={`${testIDPrefix}-option-${option}`}
                onPress={() => {
                  onChange(option);
                  onClose();
                }}
                style={[styles.optionRow, playful && value === option && playfulStyles.optionRowSelected]}
                accessibilityRole="button"
                accessibilityLabel={tFormat('ageOptionLabel', language, { age: option })}
                accessibilityState={{ selected: value === option }}
              >
                <Text style={[styles.optionText, playful && value === option && playfulStyles.optionTextSelected]}>
                  {option}
                </Text>
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
    minHeight: 48,
    justifyContent: 'center',
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

// "playful" variant overrides — colors/elevation only, layered on top of the
// structural `styles` above via a style array (see each usage site), so
// sizing/spacing/touch-targets never drift between the two variants.
const playfulStyles = StyleSheet.create({
  fieldEmpty: {
    borderColor: dsColors.line,
    borderRadius: dsRadii.lg,
    backgroundColor: dsColors.surfaceSunk,
  },
  fieldFilled: {
    borderColor: dsColors.violetDark,
    borderRadius: dsRadii.lg,
    backgroundColor: dsColors.violetSoft,
  },
  placeholder: {
    color: dsColors.inkMuted,
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
    ...dsElevation.level4,
  },
  optionRowSelected: {
    backgroundColor: dsColors.violetSoft,
  },
  optionTextSelected: {
    color: dsColors.violetDark,
  },
});

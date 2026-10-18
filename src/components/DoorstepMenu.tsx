import React from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ListRow, mix, palette, radii, shadows, spacing, tokens } from '../ui';
import { t } from '../i18n';

// The Doorstep's burger menu (docs/decisions/home-dashboard, design.md
// Decision 13) — a small transient overlay for the "not so important"
// actions the founder asked to be tucked away: Debug Log, Log a Walk We
// Missed and Settings. Not a full-screen destination itself (that's why its
// open/closed state lives in DoorstepScreen as local component state, not as
// another App.tsx showX boolean) — a plain RN Modal, no new dependency.
interface DoorstepMenuProps {
  visible: boolean;
  onClose: () => void;
  onOpenDebugLog: () => void;
  onOpenLogMissedWalk: () => void;
  /** Settings (docs/decisions/walk-reminder/design.md Decision 1) — this app's first Settings screen, tucked away here alongside the other two infrequent/secondary actions. */
  onOpenSettings: () => void;
}

export function DoorstepMenu({ visible, onClose, onOpenDebugLog, onOpenLogMissedWalk, onOpenSettings }: DoorstepMenuProps) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Inner Pressable swallows taps so touching the sheet does not close it. */}
        <Pressable style={[styles.sheet, { paddingBottom: spacing.xl + insets.bottom }]} onPress={() => {}}>
          {/* Settings first: in dev builds the LogBox warning banner covers the bottom row. */}
          <ListRow title={t('menu.settings')} icon="icon-settings" onPress={onOpenSettings} />
          <ListRow title={t('menu.logMissedWalk')} icon="icon-walks" onPress={onOpenLogMissedWalk} />
          <ListRow title={t('menu.debugLog')} icon="icon-pin" onPress={onOpenDebugLog} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    // Warm brown scrim, never pure black.
    backgroundColor: mix(tokens.brown, tokens.text, 0.3) + '40',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: palette.background,
    borderTopLeftRadius: radii.card + 4,
    borderTopRightRadius: radii.card + 4,
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    ...shadows.floating,
  },
});

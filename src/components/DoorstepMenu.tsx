import React from 'react';
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

// The Doorstep's burger menu (openspec/changes/home-dashboard, design.md
// Decision 13) — a small transient overlay for the two "not so important"
// actions the founder asked to be tucked away: Debug Log and Log a Walk We
// Missed. Not a full-screen destination itself (that's why its open/closed
// state lives in DoorstepScreen as local component state, not as another
// App.tsx showX boolean) — a plain RN Modal, no new dependency.
interface DoorstepMenuProps {
  visible: boolean;
  onClose: () => void;
  onOpenDebugLog: () => void;
  onOpenLogMissedWalk: () => void;
  /** Settings (openspec/changes/walk-reminder/design.md Decision 1) — this app's first Settings screen, tucked away here alongside the other two infrequent/secondary actions. */
  onOpenSettings: () => void;
}

export function DoorstepMenu({ visible, onClose, onOpenDebugLog, onOpenLogMissedWalk, onOpenSettings }: DoorstepMenuProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <View style={styles.sheet}>
          <TouchableOpacity style={styles.row} onPress={onOpenDebugLog}>
            <Text style={styles.rowText}>Debug Log</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.row} onPress={onOpenLogMissedWalk}>
            <Text style={styles.rowText}>Log a walk we missed</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.row} onPress={onOpenSettings}>
            <Text style={styles.rowText}>Settings</Text>
          </TouchableOpacity>
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.25)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#FAFAF8',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  row: {
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  rowText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1A2A1A',
  },
});

import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';

import { StoredWalk, WalkRepository } from '../storage/WalkRepository';
import { eligibleRefreshRoutes, MissedWalkTiming } from '../utils/manualWalkLog';

const COLORS = {
  green: '#2ECC71',
  blue: '#3498DB',
  white: '#FAFAF8',
  text: '#1A2A1A',
  muted: '#8A9A8A',
};

interface LogMissedWalkScreenProps {
  onLog: (timing: MissedWalkTiming, refreshRouteWalkId?: string) => void;
  onClose: () => void;
  /** Fetches the player's own previously-tracked walks to offer as route-refresh candidates (see utils/manualWalkLog.ts's eligibleRefreshRoutes). */
  walkRepository: WalkRepository;
  /** Whether "Log a walk we missed" may currently offer a route refresh at all (openspec/changes/home-range/design.md Decision 4's "at most 1 route refresh per calendar day" cap) — when false, the picker section is hidden entirely rather than offered and then rejected at submit time. */
  routeRefreshAvailable: boolean;
}

const OPTIONS: { timing: MissedWalkTiming; label: string }[] = [
  { timing: 'today', label: 'Earlier today' },
  { timing: 'yesterday', label: 'Yesterday' },
];

export function LogMissedWalkScreen({ onLog, onClose, walkRepository, routeRefreshAvailable }: LogMissedWalkScreenProps) {
  const [selected, setSelected] = useState<MissedWalkTiming | null>(null);
  const [routes, setRoutes] = useState<StoredWalk[]>([]);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);

  useEffect(() => {
    if (!routeRefreshAvailable) return;
    walkRepository.getWalks().then((walks) => setRoutes(eligibleRefreshRoutes(walks)));
  }, [walkRepository, routeRefreshAvailable]);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Log a walk we missed</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        <Text style={styles.prompt}>A walk with your dog that the app missed still counts. When did you head out?</Text>

        {OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.timing}
            style={[styles.option, selected === option.timing && styles.optionSelected]}
            onPress={() => setSelected(option.timing)}
          >
            <Text style={[styles.optionText, selected === option.timing && styles.optionTextSelected]}>
              {option.label}
            </Text>
          </TouchableOpacity>
        ))}

        {routeRefreshAvailable && routes.length > 0 && (
          <View style={styles.routePicker}>
            <Text style={styles.prompt}>
              Which way did he go? A route he's walked before gets a fresh start — no new ground, just a familiar
              street remembered.
            </Text>
            <TouchableOpacity
              style={[styles.option, selectedRouteId === null && styles.optionSelected]}
              onPress={() => setSelectedRouteId(null)}
            >
              <Text style={[styles.optionText, selectedRouteId === null && styles.optionTextSelected]}>
                Somewhere else this time
              </Text>
            </TouchableOpacity>
            {routes.map((route) => (
              <TouchableOpacity
                key={route.id}
                style={[styles.option, selectedRouteId === route.id && styles.optionSelected]}
                onPress={() => setSelectedRouteId(route.id)}
              >
                <Text style={[styles.optionText, selectedRouteId === route.id && styles.optionTextSelected]}>
                  Walked {new Date(route.startTime).toLocaleDateString()}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <TouchableOpacity
          style={[styles.logButton, !selected && styles.logButtonDisabled]}
          disabled={!selected}
          onPress={() => selected && onLog(selected, selectedRouteId ?? undefined)}
        >
          <Text style={styles.logButtonText}>Log this walk 🐾</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.white,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  closeText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.blue,
  },
  body: {
    padding: 24,
    gap: 12,
  },
  routePicker: {
    marginTop: 12,
    gap: 12,
  },
  prompt: {
    fontSize: 14,
    color: COLORS.muted,
    marginBottom: 8,
  },
  option: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#eee',
    backgroundColor: COLORS.white,
  },
  optionSelected: {
    borderColor: COLORS.green,
    backgroundColor: '#EAF7EE',
  },
  optionText: {
    fontSize: 15,
    fontWeight: '600',
    color: COLORS.text,
  },
  optionTextSelected: {
    color: COLORS.green,
  },
  logButton: {
    marginTop: 12,
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: COLORS.green,
  },
  logButtonDisabled: {
    opacity: 0.5,
  },
  logButtonText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 16,
  },
});

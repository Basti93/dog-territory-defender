import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { Button, Card, Header, palette, PressableScale, radii, Screen, spacing, textStyle, tokens } from '../ui';

import { StoredWalk, WalkRepository } from '../storage/WalkRepository';
import { eligibleRefreshRoutes, MissedWalkTiming } from '../utils/manualWalkLog';

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
    <Screen scroll backdrop="sky">
      <Header title="Log a walk we missed" icon="icon-walks" onBack={onClose} />

      <Card style={styles.form}>
        <Text style={[textStyle('body'), styles.prompt]}>
          A walk with your dog that the app missed still counts. When did you head out?
        </Text>

        {OPTIONS.map((option) => (
          <OptionRow
            key={option.timing}
            label={option.label}
            selected={selected === option.timing}
            onPress={() => setSelected(option.timing)}
          />
        ))}

        {routeRefreshAvailable && routes.length > 0 && (
          <View style={styles.routePicker}>
            <Text style={[textStyle('body'), styles.prompt]}>
              Which way did he go? A route he's walked before gets a fresh start — no new ground, just a familiar
              street remembered.
            </Text>
            <OptionRow label="Somewhere else this time" selected={selectedRouteId === null} onPress={() => setSelectedRouteId(null)} />
            {routes.map((route) => (
              <OptionRow
                key={route.id}
                label={`Walked ${new Date(route.startTime).toLocaleDateString()}`}
                selected={selectedRouteId === route.id}
                onPress={() => setSelectedRouteId(route.id)}
              />
            ))}
          </View>
        )}

        <Button
          label="Log this walk 🐾"
          disabled={!selected}
          onPress={() => selected && onLog(selected, selectedRouteId ?? undefined)}
          style={styles.logButton}
        />
      </Card>
    </Screen>
  );
}

function OptionRow({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <PressableScale
      style={[styles.option, selected && styles.optionSelected]}
      onPress={onPress}
      accessibilityLabel={label}
    >
      <Text style={[textStyle('body'), selected && { color: palette.greenText }]}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  routePicker: { marginTop: spacing.md, gap: spacing.md },
  prompt: { color: palette.muted },
  option: {
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.tile,
    borderWidth: 3,
    borderColor: 'transparent',
    backgroundColor: palette.background,
  },
  optionSelected: { borderColor: tokens.green, backgroundColor: palette.meadowTint },
  logButton: { marginTop: spacing.md },
});

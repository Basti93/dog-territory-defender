import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';

import { material, PaperHeader, PaperSheet, PressableScale, radii, Screen, spacing, textStyle, WoodSign } from '../ui';

import { StoredWalk, WalkRepository } from '../storage/WalkRepository';
import { eligibleRefreshRoutes, MissedWalkTiming } from '../utils/manualWalkLog';
import { formatDate, t } from '../i18n';

interface LogMissedWalkScreenProps {
  onLog: (timing: MissedWalkTiming, refreshRouteWalkId?: string) => void;
  onClose: () => void;
  /** Fetches the player's own previously-tracked walks to offer as route-refresh candidates (see utils/manualWalkLog.ts's eligibleRefreshRoutes). */
  walkRepository: WalkRepository;
  /** Whether "Log a walk we missed" may currently offer a route refresh at all (docs/decisions/2026-08-21-home-range.md Decision 4's "at most 1 route refresh per calendar day" cap) — when false, the picker section is hidden entirely rather than offered and then rejected at submit time. */
  routeRefreshAvailable: boolean;
}

const OPTIONS: { timing: MissedWalkTiming; labelKey: string }[] = [
  { timing: 'today', labelKey: 'logWalk.earlierToday' },
  { timing: 'yesterday', labelKey: 'logWalk.yesterday' },
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
    <Screen scroll backdrop="linen">
      <PaperHeader title={t('menu.logMissedWalk')} onBack={onClose} />

      <PaperSheet style={styles.form}>
        <Text style={[textStyle('body'), styles.prompt]}>
          {t('logWalk.prompt')}
        </Text>

        {OPTIONS.map((option) => (
          <OptionRow
            key={option.timing}
            label={t(option.labelKey)}
            selected={selected === option.timing}
            onPress={() => setSelected(option.timing)}
          />
        ))}

        {routeRefreshAvailable && routes.length > 0 && (
          <View style={styles.routePicker}>
            <Text style={[textStyle('body'), styles.prompt]}>
              {t('logWalk.routePrompt')}
            </Text>
            <OptionRow label={t('logWalk.somewhereElse')} selected={selectedRouteId === null} onPress={() => setSelectedRouteId(null)} />
            {routes.map((route) => (
              <OptionRow
                key={route.id}
                label={t('logWalk.walkedOn', { date: formatDate(route.startTime) })}
                selected={selectedRouteId === route.id}
                onPress={() => setSelectedRouteId(route.id)}
              />
            ))}
          </View>
        )}

        <WoodSign
          size="wide"
          fullWidth
          disabled={!selected}
          onPress={() => selected && onLog(selected, selectedRouteId ?? undefined)}
          style={styles.logButton}
        >
          {t('logWalk.submit')}
        </WoodSign>
      </PaperSheet>
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
      <Text style={[textStyle('body'), { color: material.ink }, selected && { color: material.inkGreen }]}>{label}</Text>
    </PressableScale>
  );
}

const styles = StyleSheet.create({
  form: { gap: spacing.md },
  routePicker: { marginTop: spacing.md, gap: spacing.md },
  prompt: { color: material.muted },
  option: {
    minHeight: 52,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
    borderRadius: radii.tile,
    borderWidth: 2,
    borderColor: material.linen,
    backgroundColor: material.yarn,
  },
  optionSelected: { borderColor: material.inkGreen },
  logButton: { marginTop: spacing.md },
});

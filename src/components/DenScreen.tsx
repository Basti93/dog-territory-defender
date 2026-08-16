import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { BALANCE, BuildingKey } from '../economy/balanceConfig';
import { upgradeCost, storageCap, passiveTreatsPerHour, softCapBonusPercent } from '../economy/formulas';
import { DenEconomyState, upgradeBuilding } from '../economy/denEconomy';
import { DenEconomyRepository } from '../storage/DenEconomyRepository';

const COLORS = {
  green: '#2ECC71',
  blue: '#3498DB',
  warm: '#F39C12',
  white: '#FAFAF8',
  text: '#1A2A1A',
  muted: '#8A9A8A',
};

const BUILDING_DISPLAY: Record<BuildingKey, { name: string; sub: string; color: string; lightColor: string }> = {
  doghouse: { name: 'Doghouse', sub: 'Treat storage', color: '#8B6F47', lightColor: '#D4A76A' },
  bakery: { name: 'Treat Bakery', sub: 'Passive treats', color: '#C87941', lightColor: '#F5CBA7' },
  sniffGarden: { name: 'Sniff Garden', sub: 'Collectible bonus', color: '#3A9E5F', lightColor: '#A8D5A2' },
};

const BUILDING_ORDER: BuildingKey[] = ['doghouse', 'bakery', 'sniffGarden'];

function getLevel(state: DenEconomyState, building: BuildingKey): number {
  switch (building) {
    case 'doghouse':
      return state.doghouseLevel;
    case 'bakery':
      return state.bakeryLevel;
    case 'sniffGarden':
      return state.sniffGardenLevel;
  }
}

function effectText(building: BuildingKey, level: number): string {
  switch (building) {
    case 'doghouse':
      return `Storage: ${storageCap(level)} treats`;
    case 'bakery':
      return `+${passiveTreatsPerHour(level).toFixed(1)} treats/hour`;
    case 'sniffGarden':
      return `+${softCapBonusPercent(level).toFixed(0)}% collectibles`;
  }
}

interface DenScreenProps {
  repository: DenEconomyRepository;
  onClose: () => void;
  onTreatsChanged: (treats: number) => void;
}

export function DenScreen({ repository, onClose, onTreatsChanged }: DenScreenProps) {
  const [state, setState] = useState<DenEconomyState | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showOverflowNotice, setShowOverflowNotice] = useState(false);

  useEffect(() => {
    repository.getState().then((s) => {
      setState(s);
      if (s.treats >= storageCap(s.doghouseLevel)) {
        setShowOverflowNotice(true);
      }
    });
  }, [repository]);

  if (!state) {
    return (
      <View style={styles.container}>
        <Text style={styles.empty}>Loading…</Text>
      </View>
    );
  }

  const upgradable = BUILDING_ORDER.filter((b) => getLevel(state, b) < BALANCE.maxBuildingLevel).map((building) => ({
    building,
    cost: upgradeCost(building, getLevel(state, building) + 1),
  }));
  const affordableNow = upgradable.filter((x) => state.treats >= x.cost);
  const teaseTarget = (affordableNow.length > 0 ? affordableNow : upgradable).slice().sort((a, b) => a.cost - b.cost)[0];

  const handleUpgrade = async (building: BuildingKey) => {
    const result = upgradeBuilding(state, building);
    if ('error' in result) {
      setMessage(
        result.error === 'max-level'
          ? `${BUILDING_DISPLAY[building].name} is already at max level!`
          : 'Not enough treats yet — keep walking!'
      );
      return;
    }
    setMessage(null);
    setState(result);
    onTreatsChanged(result.treats);
    await repository.saveState(result);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>The Den</Text>
        <TouchableOpacity onPress={onClose}>
          <Text style={styles.closeText}>Close</Text>
        </TouchableOpacity>
      </View>

      {showOverflowNotice && (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>Your Treat Bakery filled up while you were away! 🦴</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.denScene}>
          <Svg width={80} height={60} viewBox="0 0 80 60">
            <Circle cx={40} cy={40} r={18} fill="#D4A76A" opacity={0.5} />
            <Circle cx={40} cy={40} r={10} fill="#8B6F47" opacity={0.8} />
          </Svg>
          <Text style={styles.denSceneCaption}>Your dog is resting in the yard 🐾</Text>
        </View>

        {message && <Text style={styles.message}>{message}</Text>}

        {BUILDING_ORDER.map((building) => {
          const display = BUILDING_DISPLAY[building];
          const level = getLevel(state, building);
          const maxed = level >= BALANCE.maxBuildingLevel;
          const cost = maxed ? null : upgradeCost(building, level + 1);
          const isTease = teaseTarget?.building === building;

          return (
            <TouchableOpacity
              key={building}
              style={[styles.card, { borderColor: display.color }, isTease && styles.cardTease]}
              onPress={() => handleUpgrade(building)}
              disabled={maxed}
            >
              <View style={[styles.cardIcon, { backgroundColor: display.lightColor }]} />
              <View style={styles.cardBody}>
                <Text style={styles.cardName}>{display.name}</Text>
                <Text style={styles.cardSub}>{display.sub}</Text>
                <Text style={styles.cardEffect}>
                  Level {level} — {effectText(building, level)}
                </Text>
                {!maxed ? (
                  <>
                    <Text style={styles.cardNextEffect}>Next: {effectText(building, level + 1)}</Text>
                    <Text style={[styles.cardCost, { color: display.color }]}>
                      {isTease ? 'Next upgrade: ' : 'Upgrade: '}
                      {cost} treats
                    </Text>
                  </>
                ) : (
                  <Text style={styles.cardMaxed}>Max level!</Text>
                )}
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
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
  empty: {
    padding: 24,
    textAlign: 'center',
    color: COLORS.muted,
    fontSize: 14,
  },
  notice: {
    backgroundColor: '#FFF3E0',
    paddingVertical: 10,
    paddingHorizontal: 16,
  },
  noticeText: {
    fontSize: 13,
    color: COLORS.text,
  },
  scroll: {
    padding: 16,
    gap: 12,
  },
  denScene: {
    alignItems: 'center',
    paddingBottom: 16,
  },
  denSceneCaption: {
    marginTop: 4,
    fontSize: 12,
    color: COLORS.muted,
  },
  message: {
    fontSize: 13,
    color: COLORS.warm,
    marginBottom: 8,
    textAlign: 'center',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    marginBottom: 12,
    backgroundColor: COLORS.white,
  },
  cardTease: {
    backgroundColor: '#FFF8E7',
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  cardName: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  cardSub: {
    fontSize: 12,
    color: COLORS.muted,
  },
  cardEffect: {
    fontSize: 13,
    color: COLORS.text,
    marginTop: 2,
  },
  cardNextEffect: {
    fontSize: 12,
    color: COLORS.muted,
    marginTop: 1,
  },
  cardCost: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  cardMaxed: {
    fontSize: 13,
    fontWeight: '700',
    color: COLORS.green,
    marginTop: 2,
  },
});

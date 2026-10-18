import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import { BUILDING_DISPLAY, effectText } from '../../app/useDen';
import { BALANCE, BuildingKey } from '../../economy/balanceConfig';
import { DenEconomyState, getBuildingLevel } from '../../economy/denEconomy';
import { upgradeCost } from '../../economy/formulas';
import { formatNumber, t } from '../../i18n';
import { WoodSign, material, textStyle } from '../../ui';

interface BuildingPanelProps {
  building: BuildingKey;
  state: DenEconomyState;
  /** Gentle "not enough treats" line from useDen, if any. */
  message: string | null;
  onUpgrade: (building: BuildingKey) => void;
  onClose: () => void;
}

/**
 * The wooden sign that folds out when a building is tapped: name, level, effect, "Upgrade for N".
 * Same numbers and texts as the old Den cards (they come from useDen's helpers).
 */
export function BuildingPanel({ building, state, message, onUpgrade, onClose }: BuildingPanelProps) {
  const open = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    open.setValue(0);
    const anim = Animated.spring(open, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 8 });
    anim.start();
    return () => anim.stop();
  }, [building, open]);

  const display = BUILDING_DISPLAY[building];
  const level = getBuildingLevel(state, building);
  const maxed = level >= BALANCE.maxBuildingLevel;
  const cost = maxed ? null : upgradeCost(building, level + 1);
  const name = t(display.nameKey);

  return (
    <Animated.View
      style={[
        styles.wrap,
        {
          opacity: open,
          transform: [
            { translateY: open.interpolate({ inputRange: [0, 1], outputRange: [40, 0] }) },
            { scale: open.interpolate({ inputRange: [0, 1], outputRange: [0.85, 1] }) },
          ],
        },
      ]}
      pointerEvents="box-none"
    >
      <WoodSign size="wide" style={styles.panel}>
        <View style={styles.body}>
          <Text style={[textStyle('sign'), styles.ink]}>{name}</Text>
          <Text style={[textStyle('small'), styles.ink]}>{t('den.levelEffect', { level, effect: effectText(building, level, state) })}</Text>
          {!maxed ? (
            <Text style={[textStyle('small'), styles.muted]}>{t('den.nextEffect', { effect: effectText(building, level + 1, state) })}</Text>
          ) : (
            <Text style={[textStyle('small'), styles.green]}>{t('den.maxLevel')}</Text>
          )}
          {message && <Text style={[textStyle('small'), styles.ink]}>{message}</Text>}
          <View style={styles.actions}>
            {!maxed && (
              <WoodSign
                size="small"
                onPress={() => onUpgrade(building)}
                accessibilityLabel={t('world.upgradeFor', { cost: formatNumber(cost ?? 0) })}
                textStyleOverride={styles.button}
              >
                {t('world.upgradeFor', { cost: formatNumber(cost ?? 0) })}
              </WoodSign>
            )}
            <WoodSign size="small" onPress={onClose} accessibilityLabel={t('world.panelClose')} textStyleOverride={styles.button}>
              {t('world.panelClose')}
            </WoodSign>
          </View>
        </View>
      </WoodSign>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  panel: { alignSelf: 'stretch', paddingVertical: 12 },
  body: { alignItems: 'center', gap: 4 },
  ink: { color: material.ink, textAlign: 'center' },
  muted: { color: material.muted, textAlign: 'center' },
  green: { color: material.inkGreen, textAlign: 'center' },
  actions: { flexDirection: 'row', gap: 10, marginTop: 8, flexWrap: 'wrap', justifyContent: 'center' },
  button: { fontSize: 16, lineHeight: 20 },
});

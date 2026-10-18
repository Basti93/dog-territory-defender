import React from 'react';
import { StyleProp, StyleSheet, Text, TextStyle, View, ViewStyle } from 'react-native';
import { PressableScale } from '../PressableScale';
import { material, mix, spacing, textStyle } from '../theme';
import { PaperNote } from './PaperNote';
import { WoodSign } from './WoodSign';
import { t } from '../../i18n';

// Building blocks for the plain paper lists (Post, forms): one PaperNote sheet, thin dividers,
// Fredoka section headers, Nunito body, controls at the right. No cards inside the sheet.

const DIVIDER = mix(material.linen, material.woodRim, 0.25);

/** The single sheet of paper a list lives on. */
export function PaperSheet({ children, style, testID }: { children?: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) {
  return (
    <PaperNote style={[styles.sheet, style]} testID={testID}>
      {children}
    </PaperNote>
  );
}

/**
 * A titled block on the sheet. Every section after the first gets a thin divider on top.
 * With `onPress` the whole section is one tappable entry (title + chevron, no body).
 */
export function PaperSection({
  title,
  first,
  onPress,
  children,
}: {
  title: string;
  first?: boolean;
  onPress?: () => void;
  children?: React.ReactNode;
}) {
  if (onPress) {
    return (
      <PressableScale onPress={onPress} accessibilityLabel={title} style={[styles.section, !first && styles.divided]}>
        <View style={styles.entry}>
          <Text style={[textStyle('sign'), styles.sectionTitle, styles.entryTitle]}>{title}</Text>
          <Text style={[textStyle('sign'), styles.chevron]}>{'\u203A'}</Text>
        </View>
      </PressableScale>
    );
  }
  return (
    <View style={[styles.section, !first && styles.divided]}>
      <Text style={[textStyle('sign'), styles.sectionTitle]} accessibilityRole="header">
        {title}
      </Text>
      {children}
    </View>
  );
}

/** Top row of a paper screen: wooden back sign (when `onBack`) and the title in sign type on the linen. */
export function PaperHeader({ title, onBack, style }: { title: string; onBack?: () => void; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.header, style]}>
      {onBack && (
        <WoodSign size="small" onPress={onBack} accessibilityLabel={t('common.back')} style={styles.backSign}>
          {'\u2039'}
        </WoodSign>
      )}
      <Text style={[textStyle('signBig'), styles.headerTitle]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

export interface PaperRowProps {
  title?: string;
  subtitle?: string;
  /** Right-aligned control (Switch, time, chevron...). */
  right?: React.ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
  children?: React.ReactNode;
}

/** One list row: text at the left, control at the right. Tappable as a whole when `onPress` is given. */
export function PaperRow({ title, subtitle, right, onPress, accessibilityLabel, children }: PaperRowProps) {
  const body = (
    <View style={styles.row}>
      <View style={styles.rowText}>
        {title ? <Text style={[textStyle('body'), styles.ink]}>{title}</Text> : null}
        {subtitle ? <Text style={[textStyle('small'), styles.muted]}>{subtitle}</Text> : null}
        {children}
      </View>
      {right}
    </View>
  );
  if (!onPress) return body;
  return (
    <PressableScale onPress={onPress} accessibilityLabel={accessibilityLabel ?? title}>
      {body}
    </PressableScale>
  );
}

/** Secondary action: green text, no box. */
export function TextLink({
  label,
  onPress,
  disabled,
  style,
  textStyleOverride,
}: {
  label: string;
  onPress?: () => void;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  textStyleOverride?: StyleProp<TextStyle>;
}) {
  return (
    <PressableScale onPress={onPress} disabled={disabled} accessibilityLabel={label} style={[styles.link, style]}>
      <Text style={[textStyle('body'), styles.linkText, disabled && styles.muted, textStyleOverride]}>{label}</Text>
    </PressableScale>
  );
}

/** Hint line in the muted ink, for helper text under a row. */
export function PaperHint({ children }: { children: React.ReactNode }) {
  return <Text style={[textStyle('small'), styles.muted, styles.hint]}>{children}</Text>;
}

const styles = StyleSheet.create({
  sheet: { padding: spacing.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.lg },
  backSign: { minWidth: 48 },
  headerTitle: { flex: 1, color: material.ink },
  entry: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  entryTitle: { flex: 1, marginBottom: 0 },
  chevron: { color: material.inkGreen },
  section: { paddingVertical: spacing.md },
  divided: { borderTopWidth: 1, borderTopColor: DIVIDER },
  sectionTitle: { fontSize: 18, lineHeight: 24, color: material.ink, marginBottom: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 48, paddingVertical: spacing.xs },
  rowText: { flex: 1 },
  ink: { color: material.ink },
  muted: { color: material.muted },
  hint: { marginTop: spacing.xs },
  link: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  linkText: { color: material.inkGreen },
});

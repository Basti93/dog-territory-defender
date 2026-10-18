import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { PostcardWords } from '../../postcards/postcards';
import { material, textStyle } from '../../ui';
import { PawStamp } from './PostcardThumb';

/**
 * The handwritten side: weekday + part of the day, how far, new streets (only when there were any), Buddy's line, his
 * signature; on the right a stamp and the postmark with the territory name. Caveat in ink green, never a table.
 */
/** `stamped` = Buddy's favourite: the paw stamp sits on the postage stamp. */
export function PostcardBack({ words, stamped }: { words: PostcardWords; stamped: boolean }) {
  return (
    <View style={styles.back} testID="postcard-back">
      <View style={styles.message}>
        <Text style={[textStyle('hand'), styles.when]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
          {words.when}
        </Text>
        {words.distance && <Text style={[textStyle('hand'), styles.line]}>{words.distance}</Text>}
        {words.streets && <Text style={[textStyle('hand'), styles.line]}>{words.streets}</Text>}
        <Text style={[textStyle('hand'), styles.buddy]}>{words.buddyLine}</Text>
        <Text style={[textStyle('hand'), styles.signature]}>{words.signature}</Text>
      </View>
      <View style={styles.divider} />
      <View style={styles.address}>
        <View style={styles.stampBox}>{stamped && <PawStamp size={30} />}</View>
        <View style={styles.postmark} testID="postcard-postmark">
          <Text style={[textStyle('sign'), styles.postmarkText]} numberOfLines={3} ellipsizeMode="tail">
            {words.postmark}
          </Text>
        </View>
        <View style={styles.addressLine} />
        <View style={styles.addressLine} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  back: { flex: 1, flexDirection: 'row', backgroundColor: material.yarn, padding: 14 },
  message: { flex: 1.5, justifyContent: 'center', gap: 2 },
  when: { color: material.inkGreen, fontSize: 28, lineHeight: 32 },
  line: { color: material.inkGreen, fontSize: 22, lineHeight: 26 },
  buddy: { color: material.inkGreen, fontSize: 20, lineHeight: 24, marginTop: 6 },
  // textAlign instead of alignSelf: on Android the shrink-wrapped, self-aligned Caveat line was clipped to its first glyphs.
  signature: { color: material.inkGreen, fontSize: 22, lineHeight: 26, textAlign: 'right', marginTop: 4 },
  divider: { width: 1.5, backgroundColor: material.chalk, marginHorizontal: 12, opacity: 0.7 },
  address: { flex: 1, alignItems: 'center', gap: 10 },
  stampBox: {
    alignSelf: 'flex-end',
    width: 44,
    height: 52,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: material.chalk,
    borderRadius: 4,
    backgroundColor: material.feltUsual,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // A rounded stamp wide enough for a street-sized word; long names wrap on spaces and end in an ellipsis.
  postmark: {
    alignSelf: 'stretch',
    minHeight: 62,
    borderRadius: 31,
    borderWidth: 2.5,
    borderColor: material.inkGreen,
    opacity: 0.75,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: -22,
    marginRight: 6,
    transform: [{ rotate: '-7deg' }],
  },
  postmarkText: { color: material.inkGreen, fontSize: 12, lineHeight: 14, textAlign: 'center' },
  addressLine: { alignSelf: 'stretch', height: 1.5, backgroundColor: material.chalk, opacity: 0.7, marginTop: 4 },
});

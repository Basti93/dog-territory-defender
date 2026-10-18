import React, { useEffect, useState } from 'react';
import { Switch, Text } from 'react-native';

import { formatDate, formatTime, t, useLocale } from '../i18n';
import { material, PaperHint, PaperRow, textStyle } from '../ui';
import { getLogLastSentAt, getLogShippingEnabled, setLogShippingEnabled } from '../utils/logShipper';

/** Settings row "Protokoll an den Server senden". Render it only while joined to a household. */
export function LogShippingSwitch() {
  useLocale();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    getLogShippingEnabled().then(setEnabled, () => setEnabled(true));
  }, []);
  return (
    <>
      <PaperRow
        title={t('logShipping.switch')}
        right={
          <Switch
            value={enabled ?? true}
            disabled={enabled === null}
            onValueChange={(v) => {
              setEnabled(v);
              void setLogShippingEnabled(v);
            }}
            trackColor={{ true: material.inkGreen }}
          />
        }
      />
      <PaperHint>{t('logShipping.hint')}</PaperHint>
    </>
  );
}

/** One line for the Debug Log screen: when the last batch reached the server (this app run only). */
export function LogShippingLastSent() {
  useLocale();
  const [sentAt] = useState(() => getLogLastSentAt());
  const text =
    sentAt === null
      ? t('logShipping.never')
      : t('logShipping.lastSent', { time: `${formatDate(sentAt)} ${formatTime(sentAt)}` });
  return <Text style={[textStyle('small'), { color: material.muted, textAlign: 'center' }]}>{text}</Text>;
}

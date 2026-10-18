import React, { useEffect, useState } from 'react';
import { Switch } from 'react-native';

import { t, useLocale } from '../i18n';
import { SettingsRepository } from '../storage/SettingsRepository';
import { material, PaperHint, PaperRow } from '../ui';

/** Settings row "Runde automatisch beenden" (under the dog's section). Default on. */
export function AutoFinishSwitch({ settingsRepository }: { settingsRepository: SettingsRepository }) {
  useLocale();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    settingsRepository.getAutoFinishEnabled().then(setEnabled, () => setEnabled(true));
  }, [settingsRepository]);
  return (
    <>
      <PaperRow
        title={t('autoFinish.setting')}
        right={
          <Switch
            value={enabled ?? true}
            disabled={enabled === null}
            onValueChange={(v) => {
              setEnabled(v);
              void settingsRepository.saveAutoFinishEnabled(v);
            }}
            trackColor={{ true: material.inkGreen }}
          />
        }
      />
      <PaperHint>{t('autoFinish.settingHint')}</PaperHint>
    </>
  );
}

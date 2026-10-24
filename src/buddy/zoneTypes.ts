import { ImageSourcePropType } from 'react-native';

import type { FurZone } from './buddyAppearance';

/** One renderable Buddy piece in the fur-zone skin (generated map: zoneSources.ts). */
export interface ZoneUnit {
  /** Zone whose mask is the whole silhouette; always drawn. */
  base: FurZone;
  /** Flat white masks, tinted per zone by the app. */
  masks: Partial<Record<FurZone, ImageSourcePropType>>;
  /** Black/white shading overlay drawn over the tinted masks. */
  shade?: ImageSourcePropType;
  /** Untinted real-colour details (nose, mouth line, eyelids). */
  detail?: ImageSourcePropType;
}

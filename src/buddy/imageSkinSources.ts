// Static require() map for the pre-rendered Buddy PNG layers. Metro needs
// literal require paths, so this file is generated-by-hand and long. Layout:
// assets/buddy/<coat>/<part>.png and assets/buddy/common/*.png (see
// assets/buddy/manifest.json). Every layer shares one canvas.
import { ImageSourcePropType } from 'react-native';

import { BuddyAppearance, BuddyEarStyle, BuddyTailStyle, defaultBuddyAppearance, normalizeAppearance } from './buddyAppearance';
import type { BuddyPart, BuddyPivots } from './buddySkin';

/** Hard-coded from assets/buddy/manifest.json (fractions of the canvas, y down). Keep in sync. */
export const BUDDY_IMAGE_PIVOTS: BuddyPivots = {
  head: { x: 0.4029, y: 0.5325 }, // neck
  tail: { x: 0.6689, y: 0.6626 }, // tail base
  earLeft: { x: 0.4471, y: 0.2656 }, // ear root
  earRight: { x: 0.3452, y: 0.2234 }, // ear root
};
/** Ground line from manifest.json. */
export const BUDDY_IMAGE_GROUND_Y = 0.8566;

type Src = ImageSourcePropType;
interface CoatSources {
  body: Src;
  head: Src;
  frontLegs: Src;
  earLeft: Record<BuddyEarStyle, Src>;
  earRight: Record<BuddyEarStyle, Src>;
  tail: Record<BuddyTailStyle, Src>;
}

const COATS: Record<string, CoatSources> = {
  cream: {
    body: require('../../assets/buddy/cream/body.png'),
    head: require('../../assets/buddy/cream/head.png'),
    frontLegs: require('../../assets/buddy/cream/front-legs.png'),
    earLeft: {
      floppy: require('../../assets/buddy/cream/ear-left-floppy.png'),
      pointy: require('../../assets/buddy/cream/ear-left-pointy.png'),
      folded: require('../../assets/buddy/cream/ear-left-folded.png'),
    },
    earRight: {
      floppy: require('../../assets/buddy/cream/ear-right-floppy.png'),
      pointy: require('../../assets/buddy/cream/ear-right-pointy.png'),
      folded: require('../../assets/buddy/cream/ear-right-folded.png'),
    },
    tail: {
      curly: require('../../assets/buddy/cream/tail-curly.png'),
      straight: require('../../assets/buddy/cream/tail-straight.png'),
      stubby: require('../../assets/buddy/cream/tail-stubby.png'),
    },
  },
  golden: {
    body: require('../../assets/buddy/golden/body.png'),
    head: require('../../assets/buddy/golden/head.png'),
    frontLegs: require('../../assets/buddy/golden/front-legs.png'),
    earLeft: {
      floppy: require('../../assets/buddy/golden/ear-left-floppy.png'),
      pointy: require('../../assets/buddy/golden/ear-left-pointy.png'),
      folded: require('../../assets/buddy/golden/ear-left-folded.png'),
    },
    earRight: {
      floppy: require('../../assets/buddy/golden/ear-right-floppy.png'),
      pointy: require('../../assets/buddy/golden/ear-right-pointy.png'),
      folded: require('../../assets/buddy/golden/ear-right-folded.png'),
    },
    tail: {
      curly: require('../../assets/buddy/golden/tail-curly.png'),
      straight: require('../../assets/buddy/golden/tail-straight.png'),
      stubby: require('../../assets/buddy/golden/tail-stubby.png'),
    },
  },
  ginger: {
    body: require('../../assets/buddy/ginger/body.png'),
    head: require('../../assets/buddy/ginger/head.png'),
    frontLegs: require('../../assets/buddy/ginger/front-legs.png'),
    earLeft: {
      floppy: require('../../assets/buddy/ginger/ear-left-floppy.png'),
      pointy: require('../../assets/buddy/ginger/ear-left-pointy.png'),
      folded: require('../../assets/buddy/ginger/ear-left-folded.png'),
    },
    earRight: {
      floppy: require('../../assets/buddy/ginger/ear-right-floppy.png'),
      pointy: require('../../assets/buddy/ginger/ear-right-pointy.png'),
      folded: require('../../assets/buddy/ginger/ear-right-folded.png'),
    },
    tail: {
      curly: require('../../assets/buddy/ginger/tail-curly.png'),
      straight: require('../../assets/buddy/ginger/tail-straight.png'),
      stubby: require('../../assets/buddy/ginger/tail-stubby.png'),
    },
  },
  chocolate: {
    body: require('../../assets/buddy/chocolate/body.png'),
    head: require('../../assets/buddy/chocolate/head.png'),
    frontLegs: require('../../assets/buddy/chocolate/front-legs.png'),
    earLeft: {
      floppy: require('../../assets/buddy/chocolate/ear-left-floppy.png'),
      pointy: require('../../assets/buddy/chocolate/ear-left-pointy.png'),
      folded: require('../../assets/buddy/chocolate/ear-left-folded.png'),
    },
    earRight: {
      floppy: require('../../assets/buddy/chocolate/ear-right-floppy.png'),
      pointy: require('../../assets/buddy/chocolate/ear-right-pointy.png'),
      folded: require('../../assets/buddy/chocolate/ear-right-folded.png'),
    },
    tail: {
      curly: require('../../assets/buddy/chocolate/tail-curly.png'),
      straight: require('../../assets/buddy/chocolate/tail-straight.png'),
      stubby: require('../../assets/buddy/chocolate/tail-stubby.png'),
    },
  },
  charcoal: {
    body: require('../../assets/buddy/charcoal/body.png'),
    head: require('../../assets/buddy/charcoal/head.png'),
    frontLegs: require('../../assets/buddy/charcoal/front-legs.png'),
    earLeft: {
      floppy: require('../../assets/buddy/charcoal/ear-left-floppy.png'),
      pointy: require('../../assets/buddy/charcoal/ear-left-pointy.png'),
      folded: require('../../assets/buddy/charcoal/ear-left-folded.png'),
    },
    earRight: {
      floppy: require('../../assets/buddy/charcoal/ear-right-floppy.png'),
      pointy: require('../../assets/buddy/charcoal/ear-right-pointy.png'),
      folded: require('../../assets/buddy/charcoal/ear-right-folded.png'),
    },
    tail: {
      curly: require('../../assets/buddy/charcoal/tail-curly.png'),
      straight: require('../../assets/buddy/charcoal/tail-straight.png'),
      stubby: require('../../assets/buddy/charcoal/tail-stubby.png'),
    },
  },
  grey: {
    body: require('../../assets/buddy/grey/body.png'),
    head: require('../../assets/buddy/grey/head.png'),
    frontLegs: require('../../assets/buddy/grey/front-legs.png'),
    earLeft: {
      floppy: require('../../assets/buddy/grey/ear-left-floppy.png'),
      pointy: require('../../assets/buddy/grey/ear-left-pointy.png'),
      folded: require('../../assets/buddy/grey/ear-left-folded.png'),
    },
    earRight: {
      floppy: require('../../assets/buddy/grey/ear-right-floppy.png'),
      pointy: require('../../assets/buddy/grey/ear-right-pointy.png'),
      folded: require('../../assets/buddy/grey/ear-right-folded.png'),
    },
    tail: {
      curly: require('../../assets/buddy/grey/tail-curly.png'),
      straight: require('../../assets/buddy/grey/tail-straight.png'),
      stubby: require('../../assets/buddy/grey/tail-stubby.png'),
    },
  },
  white: {
    body: require('../../assets/buddy/white/body.png'),
    head: require('../../assets/buddy/white/head.png'),
    frontLegs: require('../../assets/buddy/white/front-legs.png'),
    earLeft: {
      floppy: require('../../assets/buddy/white/ear-left-floppy.png'),
      pointy: require('../../assets/buddy/white/ear-left-pointy.png'),
      folded: require('../../assets/buddy/white/ear-left-folded.png'),
    },
    earRight: {
      floppy: require('../../assets/buddy/white/ear-right-floppy.png'),
      pointy: require('../../assets/buddy/white/ear-right-pointy.png'),
      folded: require('../../assets/buddy/white/ear-right-folded.png'),
    },
    tail: {
      curly: require('../../assets/buddy/white/tail-curly.png'),
      straight: require('../../assets/buddy/white/tail-straight.png'),
      stubby: require('../../assets/buddy/white/tail-stubby.png'),
    },
  },
  tricolour: {
    body: require('../../assets/buddy/tricolour/body.png'),
    head: require('../../assets/buddy/tricolour/head.png'),
    frontLegs: require('../../assets/buddy/tricolour/front-legs.png'),
    earLeft: {
      floppy: require('../../assets/buddy/tricolour/ear-left-floppy.png'),
      pointy: require('../../assets/buddy/tricolour/ear-left-pointy.png'),
      folded: require('../../assets/buddy/tricolour/ear-left-folded.png'),
    },
    earRight: {
      floppy: require('../../assets/buddy/tricolour/ear-right-floppy.png'),
      pointy: require('../../assets/buddy/tricolour/ear-right-pointy.png'),
      folded: require('../../assets/buddy/tricolour/ear-right-folded.png'),
    },
    tail: {
      curly: require('../../assets/buddy/tricolour/tail-curly.png'),
      straight: require('../../assets/buddy/tricolour/tail-straight.png'),
      stubby: require('../../assets/buddy/tricolour/tail-stubby.png'),
    },
  },
};

const COMMON: Pick<Record<BuddyPart, Src>, 'eyesOpen' | 'eyesClosed' | 'mouthHappy' | 'zzz'> = {
  eyesOpen: require('../../assets/buddy/common/eyes-open.png'),
  eyesClosed: require('../../assets/buddy/common/eyes-closed.png'),
  mouthHappy: require('../../assets/buddy/common/mouth-happy.png'),
  zzz: require('../../assets/buddy/common/zzz.png'),
};

/** Sources for one look. Unknown coat/ear/tail values fall back to the defaults. Markings, size and accent are ignored here. */
export function buddyImageSources(appearance: BuddyAppearance): Partial<Record<BuddyPart, Src>> {
  const a = normalizeAppearance(appearance);
  const d = defaultBuddyAppearance();
  const coat = COATS[a.coat] ?? COATS[d.coat];
  return {
    body: coat.body,
    head: coat.head,
    frontLegs: coat.frontLegs,
    earLeft: coat.earLeft[a.earStyle] ?? coat.earLeft[d.earStyle],
    earRight: coat.earRight[a.earStyle] ?? coat.earRight[d.earStyle],
    tail: coat.tail[a.tailStyle] ?? coat.tail[d.tailStyle],
    ...COMMON,
  };
}

// Asset manifest for scripts/generateArt.mjs. Sources: assets/art/README.md (+ buddy part list below).
// Every prompt = STYLE + asset description. Keep STYLE verbatim with assets/art/README.md.

export const STYLE =
  'Soft clay 3D render, Pixar-style, rounded chunky shapes, pastel spring colors, soft studio lighting, slight top-down three-quarter view, centered on a transparent background, no text.';

const ART = 'assets/art';
const BUDDY = 'assets/buddy';

// opts.keyed === false: full-frame backdrop, no magenta background and no chroma key (google provider).
const art = (file, group, description, size, opts = {}) => ({
  file,
  dir: ART,
  group,
  size: size ?? '1024x1024',
  keyed: opts.keyed ?? true,
  prompt: `${STYLE} ${description}`,
});

// Shared by all buddy parts so the dog stays the same across layers. Spec: assets/buddy/README.md.
const DOG =
  'The same cute chunky cartoon dog from the reference, big head, neutral coat colours, sitting, three-quarter view facing LEFT, on a 1024x1024 transparent canvas.';
const PART_RULES =
  'Render ONLY the named part; every other part of the dog is completely absent (transparent). Keep the part at exactly the same position and scale as on the finished full-body dog, as if one finished dog were sliced into layers, so all layers stacked at (0,0) line up exactly with no gaps at the joins. No baked-in shadows, no ground, no background.';

const buddy = (file, part) => ({
  file,
  dir: BUDDY,
  group: 'buddy',
  size: '1024x1024',
  usesDogReference: true,
  prompt: `${STYLE} ${DOG} Part to render: ${part}. ${PART_RULES}`,
});

export const ASSETS = [
  // Den buildings
  art('doghouse-1.png', 'den', 'small cozy wooden dog house, simple roof'),
  art('doghouse-2.png', 'den', 'bigger dog house, flower box, little flag'),
  art('doghouse-3.png', 'den', 'grand dog house, garden lights, bunting, welcome mat'),
  art('bakery-1.png', 'den', 'tiny treat stand with a few bone cookies'),
  art('bakery-2.png', 'den', 'bigger treat bakery, striped awning, cookie shelf'),
  art('bakery-3.png', 'den', 'grand dog bakery, chimney, cake display, bunting'),
  art('garden-1.png', 'den', 'small garden patch, sprouts, one watering can'),
  art('garden-2.png', 'den', 'bigger garden, flowers, little fence'),
  art('garden-3.png', 'den', 'lush garden, blossoming tree, bench, butterflies'),

  // Ground and backdrops (README says 2048x1024; API supports 1536x1024, so use that)
  art('yard-ground.png', 'backdrops', 'wide soft grass patch with a few daisies, no buildings', '1536x1024', { keyed: false }),
  art('doorstep-sky.png', 'backdrops', 'soft spring sky, fluffy clouds, gentle light', undefined, { keyed: false }),
  art('celebration-burst.png', 'backdrops', 'cheerful burst of confetti and sparkles, radial', undefined, { keyed: false }),

  // Icons (single object, no background)
  art('icon-treat.png', 'icons', 'bone-shaped dog biscuit'),
  art('icon-paw.png', 'icons', 'friendly paw print'),
  art('icon-pin.png', 'icons', 'round map pin'),
  art('icon-badge.png', 'icons', 'round award badge with ribbon'),
  art('icon-home.png', 'icons', 'cozy little house'),
  art('icon-settings.png', 'icons', 'chunky friendly gear'),
  art('icon-walks.png', 'icons', 'leash curled in a loop'),
  art('icon-den.png', 'icons', 'dog house with a tiny heart'),

  // Buddy dog parts, per assets/buddy/README.md (z-order back to front: tail, ear-right, body, front-legs, head, eyes, mouth, ear-left)
  buddy('tail.png', 'the tail only; it must end at the tail base where it meets the rump, which is the rotation pivot, so keep that base clean'),
  buddy('ear-right.png', 'the far ear only (the ear on the far side of the head, mostly hidden behind the head); the ear root where it meets the head is the rotation pivot'),
  buddy('body.png', 'the torso, haunch, hind paw and far front leg only; no head, no tail, no ears, no near front leg'),
  buddy('front-legs.png', 'the near front leg(s) only, as drawn over the body'),
  buddy('head.png', 'the head, muzzle, nose and a closed happy mouth only; NO eyes (blank fur where eyes go) and NO ears'),
  buddy('eyes-open.png', 'both open eyes only, floating at the eye position on the head'),
  buddy('eyes-closed.png', 'both eyes shut and sleepy only (gentle curved lines), at exactly the same position as the open eyes'),
  buddy('mouth-happy.png', 'the open happy mouth with tongue only, at the mouth position on the head'),
  buddy('ear-left.png', 'the near ear only, which overlaps the head in the finished dog; the ear root where it meets the head is the rotation pivot'),
];

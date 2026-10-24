import { STICK_DOGS, stickDogOf, stickIdFor } from '../sticks';

describe('stickDogOf', () => {
  it('maps the per-dog ids to their dog', () => {
    for (const d of STICK_DOGS) expect(stickDogOf({ cosmeticId: stickIdFor(d.id), botName: 'Anyone' })).toBe(d.id);
  });

  it('falls back to the sender for the first-generation ids', () => {
    expect(stickDogOf({ cosmeticId: 'stick-oak', botName: 'Pfote' })).toBe('pfote');
    expect(stickDogOf({ cosmeticId: 'stick-birch', botName: 'Pfote' })).toBe('pfote');
    expect(stickDogOf({ cosmeticId: 'stick-oak', botName: 'Somebody Else' })).toBeNull();
  });

  it('is null for anything that is not a stick', () => {
    expect(stickDogOf({ cosmeticId: null, botName: 'Pfote' })).toBeNull();
    expect(stickDogOf({ cosmeticId: 'collar-sky', botName: 'Pfote' })).toBeNull();
  });
});

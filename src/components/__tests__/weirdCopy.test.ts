import { setLocale, t } from '../../i18n';
import { pickCelebrationHeadline } from '../CelebrationScreen';
import { WEIRD_ONE_IN, pickWeirdKey, seedHash, weirdLevelUpLine, weirdUpgradeLine } from '../weirdCopy';

beforeAll(() => setLocale('en'));

describe('weird copy pickers', () => {
  it('pickWeirdKey fires for exactly 1 hash in WEIRD_ONE_IN', () => {
    const keys = ['a', 'b'];
    let hits = 0;
    for (let h = 0; h < 400; h++) if (pickWeirdKey(h, keys) !== null) hits++;
    expect(hits).toBe(400 / WEIRD_ONE_IN);
    expect(pickWeirdKey(0, keys)).toBe('a');
    expect(pickWeirdKey(4, keys)).toBe('b');
    expect(pickWeirdKey(1, keys)).toBeNull();
    expect(pickWeirdKey(0, [])).toBeNull();
  });

  it('the headline is deterministic per walk id and about 1 walk in 4 is weird, with {dog} filled in', () => {
    const weirdTexts = [t('weird.headline.floating', { dog: 'Rex' }), t('weird.headline.moon')];
    let weird = 0;
    const ids = Array.from({ length: 400 }, (_, i) => `walk-${i}`);
    for (const id of ids) {
      const a = pickCelebrationHeadline(id, 'Rex');
      expect(pickCelebrationHeadline(id, 'Rex')).toBe(a);
      expect(a).not.toMatch(/[{}]/);
      if (weirdTexts.includes(a)) weird++;
    }
    expect(weird / ids.length).toBeGreaterThan(0.15);
    expect(weird / ids.length).toBeLessThan(0.35);
  });

  it('normal headlines keep their old mapping (hash % 3)', () => {
    // 'a' -> hash 97 -> 97 % 4 !== 0 so not weird; 97 % 3 === 1 -> headline.2
    expect(seedHash('a')).toBe(97);
    expect(pickCelebrationHeadline('a', 'Rex')).toBe('What a walk! Rex is thrilled.');
  });

  it('level-up and upgrade lines are rare, seeded, and come from the weird pools', () => {
    const lines = Array.from({ length: 200 }, (_, i) => weirdLevelUpLine(`w${i}`)).filter(Boolean);
    expect(lines.length).toBeGreaterThan(20);
    expect(lines.length).toBeLessThan(80);
    expect(new Set(lines)).toEqual(new Set([t('weird.levelUp.comet')]));
    const ups = Array.from({ length: 100 }, (_, i) => weirdUpgradeLine('sniffGarden', 20 + i)).filter(Boolean);
    expect(ups.length).toBeGreaterThan(10);
    expect(new Set(ups)).toEqual(new Set([t('weird.upgrade.garden')]));
  });
});

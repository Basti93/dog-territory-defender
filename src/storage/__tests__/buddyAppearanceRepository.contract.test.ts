import { BuddyAppearance, defaultBuddyAppearance, normalizeAppearance } from '../../buddy/buddyAppearance';
import { createInMemoryBuddyAppearanceRepository } from '../inMemoryBuddyAppearanceRepository';

describe('BuddyAppearanceRepository contract', () => {
  it('returns the default appearance and hasChosen false on first read', async () => {
    const repo = createInMemoryBuddyAppearanceRepository();
    expect(await repo.getAppearance()).toEqual(defaultBuddyAppearance());
    expect(await repo.hasChosen()).toBe(false);
  });

  it('round-trips every field and flips hasChosen', async () => {
    const repo = createInMemoryBuddyAppearanceRepository();
    const chosen: BuddyAppearance = {
      coat: 'tricolour',
      markings: 'mask',
      earStyle: 'folded',
      tailStyle: 'stubby',
      size: 'large',
      accentColour: 'tan',
    };
    await repo.saveAppearance(chosen);
    expect(await repo.getAppearance()).toEqual(chosen);
    expect(await repo.hasChosen()).toBe(true);
  });

  it('reset returns to default and hasChosen false', async () => {
    const repo = createInMemoryBuddyAppearanceRepository();
    await repo.saveAppearance({ ...defaultBuddyAppearance(), coat: 'grey' });
    await repo.reset();
    expect(await repo.hasChosen()).toBe(false);
    expect(await repo.getAppearance()).toEqual(defaultBuddyAppearance());
  });

  it('overwrites on a second save', async () => {
    const repo = createInMemoryBuddyAppearanceRepository();
    await repo.saveAppearance({ ...defaultBuddyAppearance(), coat: 'grey' });
    await repo.saveAppearance({ ...defaultBuddyAppearance(), coat: 'white' });
    expect((await repo.getAppearance()).coat).toBe('white');
  });

  it('falls back per field when a stored value is unknown', async () => {
    const repo = createInMemoryBuddyAppearanceRepository();
    await repo.saveAppearance({ ...defaultBuddyAppearance(), coat: 'ginger', size: 'huge' as never });
    const read = await repo.getAppearance();
    expect(read.coat).toBe('ginger');
    expect(read.size).toBe(defaultBuddyAppearance().size);
  });

  it('normalizeAppearance tolerates junk input', () => {
    expect(normalizeAppearance(null)).toEqual(defaultBuddyAppearance());
    expect(normalizeAppearance('x')).toEqual(defaultBuddyAppearance());
    expect(normalizeAppearance({ earStyle: 'pointy', tailStyle: 7 })).toEqual({
      ...defaultBuddyAppearance(),
      earStyle: 'pointy',
    });
  });
});

import { createInMemoryCornerRepository } from '../../storage/inMemoryCornerRepository';
import { createInMemoryWalkRepository } from '../../storage/inMemoryWalkRepository';
import type { Location, Walk } from '../../types';
import { updateCorners } from '../updateCorners';

const HOME_LAT = 52.5;
const HOME_LON = 13.4;
const M_PER_DEG_LAT = 111320;
const M_PER_DEG_LON = M_PER_DEG_LAT * Math.cos((HOME_LAT * Math.PI) / 180);
const DAY = 24 * 3600 * 1000;
const T0 = new Date(2026, 8, 1, 10, 0, 0).getTime();

function street(fromM: number, toM: number, startTime: number): Location[] {
  const out: Location[] = [];
  for (let i = 0, x = fromM; x <= toM; i++, x = fromM + 10 * i) {
    out.push({ latitude: HOME_LAT, longitude: HOME_LON + x / M_PER_DEG_LON, timestamp: startTime + i * 5000, accuracy: 5 });
  }
  return out;
}
const walkOn = (day: number): Walk => ({ id: `w${day}`, startTime: T0 + day * DAY, startSource: 'button', closed: true, locations: street(300, 500, T0 + day * DAY) });

async function setup(days: number[]) {
  const walkRepository = createInMemoryWalkRepository();
  for (const d of days) await walkRepository.saveWalk(walkOn(d));
  return { walkRepository, cornerRepository: createInMemoryCornerRepository() };
}

describe('updateCorners', () => {
  it('stores the corner the fourth day completes, looks up its street, and returns it with the walk that made it', async () => {
    const deps = await setup([0, 1, 2, 3]);
    const lookupStreet = jest.fn(async () => 'Lindenstraße');
    const found = await updateCorners({ ...deps, lookupStreet });
    expect(found).toHaveLength(1);
    expect(found[0].walkId).toBe('w3');
    expect(await deps.cornerRepository.getCorners()).toMatchObject([{ id: found[0].id, walkId: 'w3', street: 'Lindenstraße', name: null }]);
  });

  it('finds nothing with three days, and finds each corner only once (running again returns nothing new)', async () => {
    const two = await setup([0, 1, 2]);
    expect(await updateCorners({ ...two, lookupStreet: async () => null })).toEqual([]);
    const three = await setup([0, 1, 2, 3]);
    await updateCorners({ ...three, lookupStreet: async () => null });
    expect(await updateCorners({ ...three, lookupStreet: async () => null })).toEqual([]);
    expect(await three.cornerRepository.getCorners()).toHaveLength(1);
  });

  it('keeps the corner when the street lookup fails, and retries it on a later run', async () => {
    const deps = await setup([0, 1, 2, 3]);
    await updateCorners({ ...deps, lookupStreet: async () => null });
    expect((await deps.cornerRepository.getCorners())[0].street).toBeNull();
    await updateCorners({ ...deps, lookupStreet: async () => 'Lindenstraße' });
    expect((await deps.cornerRepository.getCorners())[0].street).toBe('Lindenstraße');
  });

  it('does not wait for a slow lookup beyond lookupWaitMs, and survives one that throws', async () => {
    const deps = await setup([0, 1, 2, 3]);
    const started = Date.now();
    await updateCorners({ ...deps, lookupStreet: () => new Promise<string | null>(() => undefined), lookupWaitMs: 20 });
    expect(Date.now() - started).toBeLessThan(1000);
    await expect(updateCorners({ ...deps, lookupStreet: async () => { throw new Error('geocoder down'); } })).resolves.toEqual([]);
  });

  it('does not find a corner the household already named (a name from the server seeds the spacing)', async () => {
    const deps = await setup([0, 1, 2, 3]);
    const [first] = await updateCorners({ ...deps, lookupStreet: async () => null });
    const other = createInMemoryCornerRepository();
    await other.setName(first.id, 'Kiosk-Ecke', 'p2', 5); // the partner's phone named it first
    expect(await updateCorners({ walkRepository: deps.walkRepository, cornerRepository: other, lookupStreet: async () => null })).toEqual([]);
    expect(await other.getCorners()).toHaveLength(1);
  });

  it('never removes a corner that is stored, even when the walks no longer make it (old rule, deleted walks)', async () => {
    const deps = await setup([0, 1]);
    // Stored under an earlier, looser rule (3 days, 150 m): the replay of two walks makes nothing, the corner stays.
    await deps.cornerRepository.addCorners([{ id: '100,200', ix: 100, iy: 200, createdAt: T0, walkId: 'old' }]);
    await deps.cornerRepository.setName('100,200', 'Kiosk-Ecke', 'p1', T0);
    expect(await updateCorners({ ...deps, lookupStreet: async () => null })).toEqual([]);
    expect(await deps.cornerRepository.getCorners()).toMatchObject([{ id: '100,200', name: 'Kiosk-Ecke' }]);
  });
});

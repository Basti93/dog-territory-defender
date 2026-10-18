import { createInMemoryCornerRepository } from '../inMemoryCornerRepository';

const found = { id: '10,20', ix: 10, iy: 20, createdAt: 1000, walkId: 'w1' };

describe('CornerRepository contract (in-memory fake)', () => {
  it('stores a found corner unnamed and ignores the same id again', async () => {
    const repo = createInMemoryCornerRepository();
    await repo.addCorners([found]);
    await repo.addCorners([{ ...found, createdAt: 5, walkId: 'other' }]);
    expect(await repo.getCorners()).toEqual([{ ...found, street: null, name: null, nameBy: null, nameAt: null }]);
  });

  it('remembers the street and a name, and the last name wins', async () => {
    const repo = createInMemoryCornerRepository();
    await repo.addCorners([found]);
    await repo.setStreet('10,20', 'Lindenstraße');
    await repo.setName('10,20', 'Kiosk-Ecke', 'p1', 2000);
    await repo.setName('10,20', 'Unsere Bank', 'p2', 3000);
    expect((await repo.getCorners())[0]).toMatchObject({ street: 'Lindenstraße', name: 'Unsere Bank', nameBy: 'p2', nameAt: 3000, createdAt: 1000, walkId: 'w1' });
  });

  it('learns a corner the other phone found first from its name', async () => {
    const repo = createInMemoryCornerRepository();
    await repo.setName('-3,7', 'Bank am Park', 'p2', 4000);
    expect(await repo.getCorners()).toEqual([{ id: '-3,7', ix: -3, iy: 7, createdAt: 4000, walkId: null, street: null, name: 'Bank am Park', nameBy: 'p2', nameAt: 4000 }]);
    await repo.addCorners([{ id: '-3,7', ix: -3, iy: 7, createdAt: 10, walkId: 'w9' }]); // our own detection arrives later: the stored one stays
    expect((await repo.getCorners())[0].name).toBe('Bank am Park');
  });

  it('setStreet on an unknown id does nothing', async () => {
    const repo = createInMemoryCornerRepository();
    await repo.setStreet('1,1', 'X');
    expect(await repo.getCorners()).toEqual([]);
  });
});

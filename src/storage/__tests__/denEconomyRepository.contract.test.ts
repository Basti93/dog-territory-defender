import { BALANCE } from '../../economy/balanceConfig';
import { createInMemoryDenEconomyRepository } from '../inMemoryDenEconomyRepository';

describe('DenEconomyRepository contract', () => {
  it('returns the default state on first read', async () => {
    const repo = createInMemoryDenEconomyRepository();

    const state = await repo.getState();

    expect(state.treats).toBe(BALANCE.startingTreats);
    expect(state.doghouseLevel).toBe(1);
    expect(state.bakeryLevel).toBe(1);
    expect(state.sniffGardenLevel).toBe(1);
  });

  it('persists saved state across subsequent reads', async () => {
    const repo = createInMemoryDenEconomyRepository();
    const state = await repo.getState();

    await repo.saveState({ ...state, treats: 999, bakeryLevel: 3 });
    const reread = await repo.getState();

    expect(reread.treats).toBe(999);
    expect(reread.bakeryLevel).toBe(3);
  });
});

import { defaultDenEconomyState, DenEconomyState } from '../economy/denEconomy';
import { DenEconomyRepository } from './DenEconomyRepository';

export function createInMemoryDenEconomyRepository(): DenEconomyRepository {
  let state: DenEconomyState | null = null;

  return {
    async getState(): Promise<DenEconomyState> {
      if (!state) {
        state = defaultDenEconomyState(Date.now());
      }
      return state;
    },

    async saveState(next: DenEconomyState): Promise<void> {
      state = next;
    },
  };
}

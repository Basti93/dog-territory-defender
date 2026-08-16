import { DenEconomyState } from '../economy/denEconomy';

export type { DenEconomyState };

export interface DenEconomyRepository {
  getState(): Promise<DenEconomyState>;
  saveState(state: DenEconomyState): Promise<void>;
}

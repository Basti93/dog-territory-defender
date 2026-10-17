import { createInMemorySettingsRepository } from '../inMemorySettingsRepository';
import { normalizeLocalePreference } from '../SettingsRepository';

describe('SettingsRepository contract', () => {
  it('defaults to system on first read', async () => {
    const repo = createInMemorySettingsRepository();
    expect(await repo.getLocalePreference()).toBe('system');
  });

  it('round-trips each preference and overwrites', async () => {
    const repo = createInMemorySettingsRepository();
    await repo.saveLocalePreference('de');
    expect(await repo.getLocalePreference()).toBe('de');
    await repo.saveLocalePreference('en');
    expect(await repo.getLocalePreference()).toBe('en');
    await repo.saveLocalePreference('system');
    expect(await repo.getLocalePreference()).toBe('system');
  });

  it('falls back to system for unknown values', async () => {
    const repo = createInMemorySettingsRepository();
    await repo.saveLocalePreference('fr' as never);
    expect(await repo.getLocalePreference()).toBe('system');
    expect(normalizeLocalePreference(undefined)).toBe('system');
  });
});

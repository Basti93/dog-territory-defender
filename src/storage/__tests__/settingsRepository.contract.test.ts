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

  it('onboardingDone defaults to false, round-trips, and is independent of locale', async () => {
    const repo = createInMemorySettingsRepository();
    expect(await repo.getOnboardingDone()).toBe(false);
    await repo.saveOnboardingDone(true);
    expect(await repo.getOnboardingDone()).toBe(true);
    await repo.saveLocalePreference('de');
    expect(await repo.getOnboardingDone()).toBe(true);
    await repo.saveOnboardingDone(false);
    expect(await repo.getOnboardingDone()).toBe(false);
    expect(await repo.getLocalePreference()).toBe('de');
  });

  it('wildExtrasLastShown defaults to {}, round-trips, drops junk, and is independent of the other settings', async () => {
    const repo = createInMemorySettingsRepository();
    expect(await repo.getWildExtrasLastShown()).toEqual({});
    await repo.saveWildExtrasLastShown({ 'tea-time': '2026-10-18', nonsense: 'x' } as never);
    expect(await repo.getWildExtrasLastShown()).toEqual({ 'tea-time': '2026-10-18' });
    await repo.saveLocalePreference('de');
    await repo.saveOnboardingDone(true);
    expect(await repo.getWildExtrasLastShown()).toEqual({ 'tea-time': '2026-10-18' });
  });

  it('logShippingEnabled defaults to true and round-trips', async () => {
    const repo = createInMemorySettingsRepository();
    expect(await repo.getLogShippingEnabled()).toBe(true);
    await repo.saveLogShippingEnabled(false);
    expect(await repo.getLogShippingEnabled()).toBe(false);
    await repo.saveLogShippingEnabled(true);
    expect(await repo.getLogShippingEnabled()).toBe(true);
  });
});

describe('autoFinishEnabled (in-memory)', () => {
  it('defaults to true and round-trips', async () => {
    const repo = createInMemorySettingsRepository();
    expect(await repo.getAutoFinishEnabled()).toBe(true);
    await repo.saveAutoFinishEnabled(false);
    expect(await repo.getAutoFinishEnabled()).toBe(false);
  });

  it('live sharing is OFF by default, the prompt is unanswered, and both round-trip independently', async () => {
    const repo = createInMemorySettingsRepository();
    expect(await repo.getLiveShareEnabled()).toBe(false);
    expect(await repo.getLiveSharePromptShown()).toBe(false);
    await repo.saveLiveSharePromptShown(true);
    expect(await repo.getLiveShareEnabled()).toBe(false);
    await repo.saveLiveShareEnabled(true);
    expect(await repo.getLiveShareEnabled()).toBe(true);
    expect(await repo.getLiveSharePromptShown()).toBe(true);
    await repo.saveLiveShareEnabled(false);
    expect(await repo.getLiveShareEnabled()).toBe(false);
  });

  it('shown partner walk ids default to [], round-trip and drop junk', async () => {
    const repo = createInMemorySettingsRepository();
    expect(await repo.getShownPartnerWalkIds()).toEqual([]);
    await repo.saveShownPartnerWalkIds(['a', 'b', 3, ''] as never);
    expect(await repo.getShownPartnerWalkIds()).toEqual(['a', 'b']);
  });
});

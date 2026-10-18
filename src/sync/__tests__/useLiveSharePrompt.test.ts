import { act, renderHook } from '@testing-library/react-native';

import { createInMemorySettingsRepository } from '../../storage/inMemorySettingsRepository';
import { useLiveSharePrompt } from '../useLiveSharePrompt';

function setup(over: { joined?: boolean; partnerName?: string | null } = {}) {
  const settings = createInMemorySettingsRepository();
  const presence = { optInChanged: jest.fn() };
  const getStatus = async () => ({ joined: over.joined ?? true, partnerName: over.partnerName === undefined ? 'Alex' : over.partnerName });
  const render = (isTracking: boolean) =>
    renderHook(({ tracking }: { tracking: boolean }) => useLiveSharePrompt({ settings, getStatus, isTracking: tracking, presence }), {
      initialProps: { tracking: isTracking },
    });
  return { settings, presence, render };
}
const flush = () => act(async () => new Promise((r) => setImmediate(r)));

describe('live share prompt', () => {
  it('asks when a walk starts while joined and never answered, naming the partner', async () => {
    const { render } = setup();
    const hook = await render(false);
    expect(hook.result.current.visible).toBe(false);
    await hook.rerender({ tracking: true });
    await flush();
    expect(hook.result.current.visible).toBe(true);
    expect(hook.result.current.partnerName).toBe('Alex');
  });

  it('yes: stores both answers, shares from now on, and tells the sender at once', async () => {
    const { settings, presence, render } = setup();
    const hook = await render(true);
    await flush();
    await act(async () => hook.result.current.answer(true));
    await flush();
    expect(hook.result.current.visible).toBe(false);
    expect(await settings.getLiveShareEnabled()).toBe(true);
    expect(await settings.getLiveSharePromptShown()).toBe(true);
    expect(presence.optInChanged).toHaveBeenCalledTimes(1);
  });

  it('no: stores the answer, shares nothing, and the question never comes again (not the next walk, not the next launch)', async () => {
    const { settings, presence, render } = setup();
    const hook = await render(true);
    await flush();
    await act(async () => hook.result.current.answer(false));
    await flush();
    expect(await settings.getLiveShareEnabled()).toBe(false);
    expect(await settings.getLiveSharePromptShown()).toBe(true);
    expect(presence.optInChanged).not.toHaveBeenCalled();

    await hook.rerender({ tracking: false });
    await hook.rerender({ tracking: true }); // next walk, same run
    await flush();
    expect(hook.result.current.visible).toBe(false);

    const relaunch = await render(true); // fresh app run, answer is persisted
    await flush();
    expect(relaunch.result.current.visible).toBe(false);
  });

  it('is not asked when not joined, or once the Settings switch was already used', async () => {
    const notJoined = setup({ joined: false });
    const a = await notJoined.render(true);
    await flush();
    expect(a.result.current.visible).toBe(false);

    const answered = setup();
    await answered.settings.saveLiveSharePromptShown(true);
    const b = await answered.render(true);
    await flush();
    expect(b.result.current.visible).toBe(false);
  });

  it('falls back to no name (the dialog says "dein Haushalt") when the partner is unknown', async () => {
    const { render } = setup({ partnerName: null });
    const hook = await render(true);
    await flush();
    expect(hook.result.current.visible).toBe(true);
    expect(hook.result.current.partnerName).toBeNull();
  });
});

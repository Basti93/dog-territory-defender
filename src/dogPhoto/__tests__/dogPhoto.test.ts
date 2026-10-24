import { ApiError } from '../../sync/apiClient';
import { defaultBuddyAppearance, furFromLegacy } from '../../buddy/buddyAppearance';
import { fitWithin, resultFromError, resultFromResponse } from '../dogPhoto';

describe('fitWithin', () => {
  it('scales the long side down to 1024 and keeps the ratio', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 1024, height: 768 });
    expect(fitWithin(3000, 4000)).toEqual({ width: 768, height: 1024 });
  });
  it('never scales up', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
    expect(fitWithin(1024, 1024)).toEqual({ width: 1024, height: 1024 });
  });
  it('survives degenerate sizes', () => {
    expect(fitWithin(0, 0)).toEqual({ width: 1, height: 1 });
  });
});

describe('resultFromResponse', () => {
  it('accepts a valid look and rejects a broken one', () => {
    const look = { ...defaultBuddyAppearance(), fur: furFromLegacy(defaultBuddyAppearance()) };
    expect(resultFromResponse({ appearance: look as never, confidence: 'high' }).kind).toBe('ok');
    expect(resultFromResponse({ appearance: { coat: 'neon' }, confidence: 'high' })).toEqual({ kind: 'failed' });
  });
});

describe('resultFromError', () => {
  it('maps server codes to calm outcomes', () => {
    expect(resultFromError(new ApiError('server', 'x', 503, 'analysis_unavailable'))).toEqual({ kind: 'unavailable' });
    expect(resultFromError(new ApiError('server', 'x', 429, 'analysis_limit'))).toEqual({ kind: 'limit' });
    expect(resultFromError(new ApiError('client', 'x', 422, 'analysis_no_dog'))).toEqual({ kind: 'failed' });
    expect(resultFromError(new ApiError('network', 'offline'))).toEqual({ kind: 'failed' });
    expect(resultFromError(new Error('boom'))).toEqual({ kind: 'failed' });
  });
});

import { isRestoreAllowed } from '../restoreGuard';

it('Restore is allowed only when not in a household', () => {
  expect(isRestoreAllowed(false)).toBe(true);
  expect(isRestoreAllowed(true)).toBe(false);
});

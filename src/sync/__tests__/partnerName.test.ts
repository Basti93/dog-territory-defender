import { pickPartnerName } from '../partnerName';

describe('pickPartnerName', () => {
  it('is the other household member, never yourself', () => {
    expect(pickPartnerName('me', { me: 'Sam', alex: 'Alex' })).toBe('Alex');
  });
  it('is null when nobody else is known (the copy then says "dein Haushalt")', () => {
    expect(pickPartnerName('me', { me: 'Sam' })).toBeNull();
    expect(pickPartnerName('me', {})).toBeNull();
    expect(pickPartnerName('me', { me: 'Sam', other: '  ' })).toBeNull();
  });
  it('is stable with several others: the alphabetically first', () => {
    expect(pickPartnerName('me', { a: 'Zoe', b: 'Anna' })).toBe('Anna');
  });
});

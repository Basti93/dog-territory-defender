import { BUDDY_EAR_STYLES, BUDDY_FUR_LENGTHS, BUDDY_MUZZLES, BUDDY_TAIL_STYLES, defaultBuddyAppearance, furFromLegacy, BuddyFur } from '../buddyAppearance';
import { imageSkinFor } from '../imageSkin';
import { zoneLayers, zoneUnitName } from '../zoneSkin';
import { ZONE_UNITS } from '../zoneSources';

const solid = (hex: string): BuddyFur => {
  const fur = furFromLegacy({ coat: 'golden', markings: 'none' });
  for (const z of Object.keys(fur.zones) as (keyof BuddyFur['zones'])[]) fur.zones[z] = hex;
  return fur;
};

describe('zone skin', () => {
  it('every part of every look resolves to an existing zone unit', () => {
    for (const muzzle of BUDDY_MUZZLES)
      for (const furLength of BUDDY_FUR_LENGTHS)
        for (const earStyle of BUDDY_EAR_STYLES)
          for (const tailStyle of BUDDY_TAIL_STYLES) {
            const fur = { ...solid('#E0A94E'), muzzle, furLength };
            const a = { ...defaultBuddyAppearance(), earStyle, tailStyle, fur };
            for (const part of ['body', 'head', 'frontLegs', 'frontLegsWalkA', 'frontLegsWalkB', 'earLeft', 'earRight', 'tail', 'poseLying'] as const) {
              const unit = zoneUnitName(part, a, fur);
              expect(unit && ZONE_UNITS[unit]).toBeTruthy();
            }
            expect(zoneUnitName('fluff', a, fur) === undefined).toBe(furLength === 'short');
          }
  });

  it('a one-colour dog draws only the base mask plus shade (sub-zones equal to the base are skipped)', () => {
    const layers = zoneLayers('body', solid('#E0A94E'));
    expect(layers.filter((l) => l.tint)).toHaveLength(1);
    expect(layers.filter((l) => !l.tint)).toHaveLength(1);
  });

  it('a differing zone adds exactly its mask, tinted with the softened colour', () => {
    const fur = solid('#4A423E');
    fur.zones.chest = '#F7F2EA';
    fur.zones.paws = '#00FF00'; // neon in, clay out
    const tints = zoneLayers('body', fur).map((l) => l.tint).filter(Boolean);
    expect(tints).toHaveLength(3);
    expect(tints).toContain('#F7F2EA');
    expect(tints).not.toContain('#00FF00');
  });

  it('the head layers add the details, and the muzzle zone only when it differs', () => {
    const fur = solid('#4A423E');
    expect(zoneLayers('head', fur).filter((l) => l.tint)).toHaveLength(1);
    fur.zones.muzzle = '#F7F2EA';
    expect(zoneLayers('head', fur).filter((l) => l.tint)).toHaveLength(2);
    expect(zoneLayers('head', fur).filter((l) => !l.tint)).toHaveLength(2); // shade + detail
  });

  it('skin cache: same look shares a skin, a different zone colour or muzzle does not, legacy look unaffected', () => {
    const a = { ...defaultBuddyAppearance(), fur: solid('#E0A94E') };
    expect(imageSkinFor(a)).toBe(imageSkinFor({ ...a, fur: solid('#E0A94E') }));
    expect(imageSkinFor(a)).not.toBe(imageSkinFor({ ...a, fur: solid('#4A423E') }));
    expect(imageSkinFor(a)).not.toBe(imageSkinFor({ ...a, fur: { ...solid('#E0A94E'), muzzle: 'long' } }));
    expect(imageSkinFor(defaultBuddyAppearance())).not.toBe(imageSkinFor(a));
    expect(imageSkinFor(a).parts.fluff).toBeUndefined();
    expect(imageSkinFor({ ...a, fur: { ...a.fur, furLength: 'fluffy' } }).parts.fluff).toBeDefined();
  });
});

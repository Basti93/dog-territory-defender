import { postcardForWalk } from '../postcards';
import { MAX_NEIGHBOURS_ON_CARD, metNeighboursOf, neighbourName, neighboursOnCard, neighbourPortrait, ourDogPortrait } from '../company';
import { trackedWalk } from '../../test/postcardFixtures';
import { STICK_DOGS } from '../../economy/sticks';

describe('postcard company', () => {
  it('keeps known, distinct dogs from a stored walk, at most three, and nothing for old walks', () => {
    expect(metNeighboursOf({})).toEqual([]);
    expect(metNeighboursOf({ metNeighbourIds: ['momo', 'ghost', 'momo', 'keks', 'lotte', 'nebel'] })).toEqual(['momo', 'keks', 'lotte']);
  });

  it('shows at most two neighbours: 0, 1 and 2 met', () => {
    expect(neighboursOnCard([])).toEqual([]);
    expect(neighboursOnCard(['bruno'])).toEqual([{ id: 'bruno', name: 'Bruno', pose: 'trot' }]);
    const two = neighboursOnCard(['keks', 'nebel', 'momo']);
    expect(two).toHaveLength(MAX_NEIGHBOURS_ON_CARD);
    expect(two.map((n) => n.pose)).toEqual(['trot', 'sit']);
  });

  it('has portrait art for every dog and pose, and no portrait of our dog yet', () => {
    for (const d of STICK_DOGS) for (const pose of ['sit', 'trot'] as const) expect(neighbourPortrait(d.id, pose)).not.toBeNull();
    expect(ourDogPortrait()).toBeNull();
    expect(neighbourName('pfote')).toBe('Pfote');
    expect(neighbourName(undefined)).toBe('');
  });

  it('puts the met dogs into the card facts', () => {
    const walk = { ...trackedWalk('met-walk'), metNeighbourIds: ['lotte'] };
    expect(postcardForWalk(walk, [])!.facts.metNeighbours).toEqual(['lotte']);
    expect(postcardForWalk(trackedWalk('plain-walk'), [])!.facts.metNeighbours).toEqual([]);
  });
});

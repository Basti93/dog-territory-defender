import { cumulativeXpForLevel } from '../formulas';
import {
  currentTitleForLevel,
  isMilestoneLevel,
  milestoneIndexForLevel,
  shouldFireCliffhanger,
  titleForLevel,
} from '../milestones';

describe('milestoneIndexForLevel / isMilestoneLevel', () => {
  it('matches design.md\'s worked milestone sequence (gap(k) = min(k, 8) starting at level 2)', () => {
    const expectedLevels = [2, 4, 7, 11, 16, 22, 29, 37, 45, 53];
    expectedLevels.forEach((level, i) => {
      expect(isMilestoneLevel(level)).toBe(true);
      expect(milestoneIndexForLevel(level)).toBe(i + 1);
    });
  });

  it('level 1 and non-milestone levels are not milestones', () => {
    expect(isMilestoneLevel(1)).toBe(false);
    expect(milestoneIndexForLevel(1)).toBeNull();
    for (const level of [3, 5, 6, 8, 9, 10, 12]) {
      expect(isMilestoneLevel(level)).toBe(false);
    }
  });

  it('the gap between milestones caps at 8 levels, so the sequence never stops widening (no final entry)', () => {
    // 45 -> 53 -> 61 -> 69 ...: every subsequent gap is exactly 8.
    expect(isMilestoneLevel(61)).toBe(true);
    expect(isMilestoneLevel(69)).toBe(true);
  });
});

describe('titleForLevel', () => {
  it('returns the game-master-authored title for each of the first 8 milestone levels', () => {
    const expectedTitles = [
      [2, 'Doorstep Sniffer'],
      [4, 'Block Wanderer'],
      [7, 'Neighborhood Explorer'],
      [11, 'Trail Regular'],
      [16, 'Seasoned Rambler'],
      [22, 'Rain-or-Shine Wayfarer'],
      [29, 'Boundless Roamer'],
      [37, 'Horizon Chaser'],
    ] as const;
    for (const [level, title] of expectedTitles) {
      expect(titleForLevel(level)).toBe(title);
    }
  });

  it('returns null for a milestone level past the authored titles (9th milestone, level 45)', () => {
    expect(titleForLevel(45)).toBeNull();
  });

  it('returns null for a non-milestone level regardless of copy state', () => {
    expect(titleForLevel(5)).toBeNull();
  });
});

describe('currentTitleForLevel', () => {
  it('returns null below the first milestone level (no title yet)', () => {
    expect(currentTitleForLevel(1)).toBeNull();
  });

  it('returns the lower milestone\'s title for a level between two milestones', () => {
    // Level 12 sits between milestones at 11 ("Trail Regular") and 16.
    expect(currentTitleForLevel(12)).toBe('Trail Regular');
  });

  it('returns its own title for an exact milestone level', () => {
    expect(currentTitleForLevel(11)).toBe('Trail Regular');
    expect(currentTitleForLevel(16)).toBe('Seasoned Rambler');
  });

  it('returns the 8th authored title indefinitely past level 37, not null', () => {
    expect(currentTitleForLevel(45)).toBe('Horizon Chaser');
    expect(currentTitleForLevel(100)).toBe('Horizon Chaser');
  });
});

describe('shouldFireCliffhanger', () => {
  it('fires when the next level is a milestone and the trailing average XP covers the remaining gap', () => {
    // Next level (2) is a milestone; 5 XP short with a trailing average of 20.
    expect(shouldFireCliffhanger(1, cumulativeXpForLevel(2) - 5, 20)).toBe(true);
  });

  it('does not fire when the trailing average XP is smaller than the remaining gap', () => {
    expect(shouldFireCliffhanger(1, cumulativeXpForLevel(2) - 50, 20)).toBe(false);
  });

  it('does not fire when the next level is not a milestone level', () => {
    // Level 3 -> 4 is a milestone (4), but level 2 -> 3 is not.
    expect(shouldFireCliffhanger(2, cumulativeXpForLevel(3) - 1, 1000)).toBe(false);
  });

  it('does not fire at or above maxLevel', () => {
    expect(shouldFireCliffhanger(100, 0, 1_000_000)).toBe(false);
  });
});

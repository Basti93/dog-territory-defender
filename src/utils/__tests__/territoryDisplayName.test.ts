import { setLocale } from '../../i18n';
import { displayTerritoryName } from '../territoryDisplayName';

afterEach(() => setLocale('en'));

describe('displayTerritoryName', () => {
  it('shows generated defaults in the current language', () => {
    setLocale('de');
    expect(displayTerritoryName("Newt's New Range")).toBe('Neues Revier von Newt');
    expect(displayTerritoryName("Newt's Isar Range")).toBe('Revier von Newt rund um Isar');
    expect(displayTerritoryName('A new corner')).toBe('Eine neue Ecke');
    setLocale('en');
    expect(displayTerritoryName('Neues Revier von Newt')).toBe("Newt's New Range");
    expect(displayTerritoryName('Revier von Newt rund um Isar')).toBe("Newt's Isar Range");
    expect(displayTerritoryName('Eine neue Ecke')).toBe('A new corner');
  });

  it('never touches a name the player typed', () => {
    setLocale('de');
    expect(displayTerritoryName('Hinterm Park')).toBe('Hinterm Park');
    expect(displayTerritoryName("Mum's garden")).toBe("Mum's garden");
  });
});

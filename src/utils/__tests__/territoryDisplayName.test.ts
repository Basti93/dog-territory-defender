import { setLocale } from '../../i18n';
import { displayTerritoryName } from '../territoryDisplayName';

afterEach(() => setLocale('en'));

describe('displayTerritoryName', () => {
  it('shows generated defaults in the current language', () => {
    setLocale('de');
    // older generated names are re-rendered in the new wording
    expect(displayTerritoryName("Newt's New Range")).toBe('Neues Revier');
    expect(displayTerritoryName("Newt's Isar Range")).toBe('Newts Revier an der Isar');
    expect(displayTerritoryName('Revier von Newt rund um Isar')).toBe('Newts Revier an der Isar');
    expect(displayTerritoryName("Newt's territory on Isar")).toBe('Newts Revier an der Isar');
    expect(displayTerritoryName('A new corner')).toBe('Neues Revier');
    expect(displayTerritoryName('A new territory')).toBe('Neues Revier');
    setLocale('en');
    expect(displayTerritoryName('Neues Revier von Newt')).toBe('New territory');
    expect(displayTerritoryName('Newts Revier an der Isar')).toBe("Newt's territory on Isar");
    expect(displayTerritoryName('Neues Revier')).toBe('New territory');
    expect(displayTerritoryName('Eine neue Ecke')).toBe('New territory');
  });

  it('never touches a name the player typed', () => {
    setLocale('de');
    expect(displayTerritoryName('Hinterm Park')).toBe('Hinterm Park');
    expect(displayTerritoryName("Mum's garden")).toBe("Mum's garden");
  });
});

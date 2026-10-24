import React from 'react';
import { act, screen } from '@testing-library/react-native';

import { setLocale, t } from '../../i18n';
import { createInMemoryCornerRepository } from '../../storage/inMemoryCornerRepository';
import { createInMemoryHomeRangeRepository } from '../../storage/inMemoryHomeRangeRepository';
import { createInMemoryWalkRepository } from '../../storage/inMemoryWalkRepository';
import { flush, renderScreen } from '../../test/render';
import { MapView } from '../MapView';
import { useViertelChrome } from '../world/useViertelChrome';

const { posted } = require('react-native-webview') as { posted: string[] };
const cornerPosts = () => posted.map((m) => JSON.parse(m)).filter((m) => m.type === 'SHOW_CORNERS');
const notePosts = () => posted.map((m) => JSON.parse(m)).filter((m) => m.type === 'SHOW_NOTES');

// The Viertel the way the scene mounts it: the chrome hook feeding the embedded map and its signs.
function Viertel({
  homeRangeRepository,
  walkRepository,
  cornerRepository,
}: {
  homeRangeRepository: ReturnType<typeof createInMemoryHomeRangeRepository>;
  walkRepository: ReturnType<typeof createInMemoryWalkRepository>;
  cornerRepository?: ReturnType<typeof createInMemoryCornerRepository>;
}) {
  const chrome = useViertelChrome({ homeRangeRepository, walkRepository, cornerRepository, dogName: 'Rex', wildSpot: null });
  return <MapView embedded locations={[]} homeRangeRepository={homeRangeRepository} chrome={chrome} onOpenTerritories={() => undefined} />;
}

beforeEach(() => {
  jest.useFakeTimers();
  posted.length = 0;
});
afterEach(() => {
  jest.useRealTimers();
  setLocale('en');
});

describe('Viertel signs and notes follow the language', () => {
  it('a switch in Settings re-words the stats sign and re-posts SHOW_NOTES, without reading the data again', async () => {
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    await homeRangeRepository.paintCells([{ ix: 10, iy: 10, refreshedAt: Date.now(), tracked: true }]);
    const walkRepository = createInMemoryWalkRepository();
    const getCells = jest.spyOn(homeRangeRepository, 'getCells');

    await renderScreen(<Viertel homeRangeRepository={homeRangeRepository} walkRepository={walkRepository} />);
    await flush();
    await flush();
    expect(screen.getByText('1 street')).toBeOnTheScreen();
    expect(notePosts().pop().payload.notes.map((n: { text: string }) => n.text)).toEqual(['you were here today']);
    const postsBefore = notePosts().length;
    const readsBefore = getCells.mock.calls.length;

    await act(async () => setLocale('de'));
    await flush();

    expect(screen.getByText('1 Straße')).toBeOnTheScreen();
    expect(screen.queryByText('1 street')).toBeNull();
    expect(screen.getByText(t('viertel.territories'))).toBeOnTheScreen(); // 'Reviere ›'
    const posts = notePosts();
    expect(posts.length).toBe(postsBefore + 1); // re-posted on the locale change only
    expect(posts.pop().payload.notes.map((n: { text: string }) => n.text)).toEqual(['hier wart ihr heute']);
    expect(getCells.mock.calls.length).toBe(readsBefore); // the texts were rebuilt, nothing was loaded again
  });

  it('counts the household\'s corners on the stats sign ("1 Ecke") and posts their signs: named, "Ecke {street}", never blank', async () => {
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    await homeRangeRepository.paintCells([{ ix: 10, iy: 10, refreshedAt: Date.now(), tracked: true }]);
    const cornerRepository = createInMemoryCornerRepository();
    await cornerRepository.addCorners([{ id: '100,200', ix: 100, iy: 200, createdAt: 1, walkId: 'w1' }]);
    await cornerRepository.setStreet('100,200', 'Lindenstraße');

    await renderScreen(<Viertel homeRangeRepository={homeRangeRepository} walkRepository={createInMemoryWalkRepository()} cornerRepository={cornerRepository} />);
    await flush();
    await flush();
    expect(screen.getByText('1 corner')).toBeOnTheScreen();
    expect(cornerPosts().pop().payload.corners).toEqual([{ id: '100,200', name: 'Lindenstraße corner', ix: 100, iy: 200 }]);

    await act(async () => setLocale('de'));
    await flush();
    expect(screen.getByText('1 Ecke')).toBeOnTheScreen();
    expect(cornerPosts().pop().payload.corners[0].name).toBe('Ecke Lindenstraße');
  });

  it('shows the household\'s name when there is one, and counts a street\'s two ids once', async () => {
    const homeRangeRepository = createInMemoryHomeRangeRepository();
    await homeRangeRepository.paintCells([{ ix: 10, iy: 10, refreshedAt: Date.now(), tracked: true }]);
    const cornerRepository = createInMemoryCornerRepository();
    await cornerRepository.addCorners([{ id: '100,200', ix: 100, iy: 200, createdAt: 1, walkId: 'w1' }]);
    await cornerRepository.setName('100,200', 'Kiosk-Ecke', 'p-lisa', 5);
    await cornerRepository.setName('100,201', 'Zwilling', null, 6); // the next cell over: the same street, resolved to one corner
    await cornerRepository.addCorners([{ id: '5000,5000', ix: 5000, iy: 5000, createdAt: 3, walkId: 'w2' }]);

    await renderScreen(<Viertel homeRangeRepository={homeRangeRepository} walkRepository={createInMemoryWalkRepository()} cornerRepository={cornerRepository} />);
    await flush();
    await flush();
    expect(screen.getByText('2 corners')).toBeOnTheScreen();
    expect(cornerPosts().pop().payload.corners.map((c: { name: string }) => c.name).sort()).toEqual(['Kiosk-Ecke', 'Our corner']);
  });
});

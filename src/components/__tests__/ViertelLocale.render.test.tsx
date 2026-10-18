import React from 'react';
import { act, screen } from '@testing-library/react-native';

import { setLocale, t } from '../../i18n';
import { createInMemoryHomeRangeRepository } from '../../storage/inMemoryHomeRangeRepository';
import { createInMemoryWalkRepository } from '../../storage/inMemoryWalkRepository';
import { flush, renderScreen } from '../../test/render';
import { MapView } from '../MapView';
import { useViertelChrome } from '../world/useViertelChrome';

const { posted } = require('react-native-webview') as { posted: string[] };
const notePosts = () => posted.map((m) => JSON.parse(m)).filter((m) => m.type === 'SHOW_NOTES');

// The Viertel the way the scene mounts it: the chrome hook feeding the embedded map and its signs.
function Viertel({ homeRangeRepository, walkRepository }: { homeRangeRepository: ReturnType<typeof createInMemoryHomeRangeRepository>; walkRepository: ReturnType<typeof createInMemoryWalkRepository> }) {
  const chrome = useViertelChrome({ homeRangeRepository, walkRepository, dogName: 'Rex', wildSpot: null });
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
    expect(notePosts().pop().payload.notes.map((n: { text: string }) => n.text)).toEqual(['stitched today']);
    const postsBefore = notePosts().length;
    const readsBefore = getCells.mock.calls.length;

    await act(async () => setLocale('de'));
    await flush();

    expect(screen.getByText('1 Straße')).toBeOnTheScreen();
    expect(screen.queryByText('1 street')).toBeNull();
    expect(screen.getByText(t('viertel.territories'))).toBeOnTheScreen(); // 'Reviere ›'
    const posts = notePosts();
    expect(posts.length).toBe(postsBefore + 1); // re-posted on the locale change only
    expect(posts.pop().payload.notes.map((n: { text: string }) => n.text)).toEqual(['heute genäht']);
    expect(getCells.mock.calls.length).toBe(readsBefore); // the texts were rebuilt, nothing was loaded again
  });
});

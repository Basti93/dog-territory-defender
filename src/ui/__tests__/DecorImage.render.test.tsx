import React from 'react';
import { imagesIn, renderScreen } from '../../test/render';
import { DecorImage } from '../DecorImage';

// Regression: an Android <Image> sized only by absoluteFill insets renders at its
// intrinsic pixel size. Decorative images must carry an explicit size.
test('DecorImage gives its Image an explicit percentage size, not inset-only', async () => {
  const view = await renderScreen(<DecorImage source={{ uri: 'x' }} style={{ width: 100, height: 50 }} />);
  const imgs = imagesIn(view.root);
  expect(imgs.length).toBe(1);
  const raw = imgs[0].props.style;
  const style = Array.isArray(raw) ? Object.assign({}, ...raw.flat()) : raw;
  expect(style.width).toBe('100%');
  expect(style.height).toBe('100%');
  await view.unmount();
});

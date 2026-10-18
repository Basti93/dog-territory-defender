import { PICKER_STEPS } from '../pickerSteps';

describe('PICKER_STEPS', () => {
  it('includes Markings between coat and ears, and ends with done', () => {
    expect(PICKER_STEPS).toEqual(['coat', 'markings', 'earStyle', 'tailStyle', 'size', 'done']);
  });
});

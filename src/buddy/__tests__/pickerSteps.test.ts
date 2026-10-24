import { PICKER_STEPS } from '../pickerSteps';

describe('PICKER_STEPS', () => {
  it('keeps preset coat/markings first, then optional Fell and Form, ends with done', () => {
    expect(PICKER_STEPS).toEqual(['coat', 'markings', 'fur', 'form', 'earStyle', 'tailStyle', 'size', 'done']);
  });
});

// Step order of the look picker (BuddyAppearancePicker). Pure so a test can pin it.
// The accent colour has no step: it is baked into the painted art.
export const PICKER_STEPS = ['coat', 'markings', 'earStyle', 'tailStyle', 'size', 'done'] as const;
export type PickerStep = (typeof PICKER_STEPS)[number];

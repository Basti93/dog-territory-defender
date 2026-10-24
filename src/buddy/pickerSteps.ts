// Step order of the look picker (BuddyAppearancePicker). Pure so a test can pin it.
// `fur` (zone colours) and `form` (muzzle, fur length) are optional: Next alone keeps the preset coat.
// The accent colour has no step: it is baked into the painted art.
export const PICKER_STEPS = ['coat', 'markings', 'fur', 'form', 'earStyle', 'tailStyle', 'size', 'done'] as const;
export type PickerStep = (typeof PICKER_STEPS)[number];

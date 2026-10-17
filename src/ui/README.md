# src/ui kit

Import everything from `'../ui'`. Style: soft clay, pastel spring, chunky rounded shapes. No dark mode, no new colours (tints come from `mix()` of tokens).

## Setup (App.tsx, once)
```tsx
const { loaded } = useAppFonts();   // Nunito Regular/SemiBold/Bold/ExtraBold
if (!loaded) return null;           // recommended gate; without it text is system font until loaded
```
`Screen` reads safe-area insets itself, so don't also wrap it in `SafeAreaView` (needs a `SafeAreaProvider`, already in App.tsx).

## Theme (`theme.ts`)
`palette` (background, card, text, muted, meadowTint, skyTint, warmTint, border, shadow), `radii` (card 24, pill 999, chip 14), `spacing` (xs4 sm8 md12 lg16 xl24 xxl32), `shadows.soft|card|floating`, `type` scale.
Text: `<Text style={[textStyle('h1'), { color: palette.muted }]}>`. Names: display 32/800, h1 24/700, h2 18/700, body 16/600, small 13/600, min 12. Never set `fontWeight` yourself when using Nunito (Android ignores it); pick another `textStyle`. Never go below 12.

## Components (all take `style`)
- `Screen` props `scroll`, `backdrop='sky'|'none'`, `contentStyle`: `<Screen scroll backdrop="sky">...</Screen>`
- `Header` props `title`, `icon`, `onBack`, `right`: `<Header title="Walks" icon="icon-walks" onBack={back} right={<Chip label="3" icon="icon-treat"/>} />`
- `Card` props `tint='meadow'|'sky'|'warm'`, `title`: `<Card tint="sky" title="Today">...</Card>`
- `Button` props `label`, `onPress`, `variant='primary'|'secondary'|'ghost'`, `icon`, `pulse`, `disabled`: `<Button label="Start walk" icon="icon-paw" pulse onPress={go} />`
- `Chip` / `Badge` props `label`, `icon`, `tint`: `<Chip label="12 treats" icon="icon-treat" tint="warm" />`
- `StatTile` props `value`, `label`, `icon`, `decimals`, `format`: `<StatTile value={42} label="Walks" icon="icon-walks" />` (wrap in a row with `gap`)
- `ListRow` props `title`, `subtitle`, `icon`, `onPress`, `hideChevron`: `<ListRow title="Park loop" subtitle="Mon, 2.1 km" icon="icon-pin" onPress={open} />`
- `EmptyState` props `title`, `message`, children = Buddy: `<EmptyState title="No walks yet" message="Your first one will show up here."><BuddyAvatar .../></EmptyState>`
- `ArtImage` props `art`, `size`, `width`, `height`: `<ArtImage art="icon-den" size={32} />` (contain-fit, rounded placeholder if PNG is missing)

## Existing primitives (unchanged)
`PressableScale`, `AnimatedNumber`, `Confetti`, `TreatPop`, `FadeSlideIn`, `tokens`. Keep copy warm: claim, defend, protect.

## Fonts
`assets/fonts/Nunito-*.ttf` (OFL, see `OFL.txt`). `font(role)` returns the family only once loaded, else `undefined`.

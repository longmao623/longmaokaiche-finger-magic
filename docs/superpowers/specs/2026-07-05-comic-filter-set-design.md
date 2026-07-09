# Comic Filter Set Design

## Goal

Keep the existing `热力海报` effect, remove the other current filters, and add nine comic-inspired filters so multiple hand regions can show different visual styles at the same time.

## Chosen Approach

Use the existing region picker model. Each of the three active hand regions keeps an independent effect selector, and each selector exposes the same ten-filter list. This preserves the current interaction model and lets the user create a mixed comic style by assigning different filters to different regions or frozen frames.

## Filter List

- `热力海报`: existing heat-map poster effect.
- `黑白墨线`: high-contrast black-and-white ink with hard shadows.
- `日漫网点`: grayscale Japanese manga screentone with fine outline emphasis.
- `赛璐璐动画`: clean cel-shaded color blocks with dark contour lines.
- `美式波普`: saturated red, blue, and yellow with comic dot texture.
- `彩色漫画`: reference-image-inspired cyan, red, yellow, black-line, halftone look.
- `错版孔版印刷`: independent-comic riso print with limited colors and slight channel offsets.
- `蓝图线稿`: deep-blue sketch/blueprint linework.
- `报纸半调`: muted newsprint comic with coarse dots.
- `故障印刷`: multiverse print error with RGB separation and scanline blocks.

## Defaults

The default three region effects will be:

- Thumb to Index: `彩色漫画`
- Index to Middle: `日漫网点`
- Middle to Pinky: `美式波普`

These defaults emphasize the reference image and immediately show multiple comic styles without requiring setup.

## Implementation Notes

Update `src/effect-selection.js` so `EFFECTS` contains only the ten approved effects and default selections use the three defaults above. Update `src/webgl-renderer.js` so the fragment shader implements the nine new shader branches while preserving `posterHeat`.

The existing duplicate-selection swap behavior remains unchanged: the three live region selectors should keep different selected effects.

## Testing

Update the effect-selection tests first so they fail against the current filter set. The tests should verify:

- Exactly ten approved effects are exposed.
- Removed legacy effects are no longer accepted.
- Defaults match the chosen three-region set and remain unique.
- Picker models still expose the full ten-effect option list.
- Duplicate swapping and invalid effect validation still work.

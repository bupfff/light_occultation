# Light Occultation

Drag glass across a page and watch it bend what's behind it, or sketch a lens of your own. An occultation is one body passing in front of a light source, and every shape here does the same to the page: a real-time refraction renderer built on WebGPU.

[Live demo](https://bupfff.github.io/light_occultation/)

Light Occultation started as a fork of [Glass Effect WebGPU](https://github.com/jeantimex/glass-effect-webgpu) by jeantimex, which provides the core glass renderer.

## Features

- **Sketched shapes**: Choose Custom, draw any outline, and it becomes refractive glass. Extra strokes join on.
- **Circles and rectangles**: Add up to 8 shapes in any mix, then drag, resize, and tune each one separately.
- **Merging**: Set Overlap to Merge and neighboring shapes melt together, including sketched ones.
- **Interactive animations**: Spring-based liquid deformation on press and drag.
- **Backgrounds**: Title page, article, video, or a moving grid.
- **Detailed controls**: Refraction, blur, shadow, highlights, tint, and icons.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `S` | Sketch a new shape |
| `Delete` | Remove the selected shape |
| `Enter` | Finish a sketch |
| `Ctrl/Cmd` + `Z` | Undo the last stroke |
| `Esc` | Cancel a sketch |

## Technical Notes

- **WebGPU shader pipeline**: The liquid glass surface is rendered in WGSL with refraction, blur, specular highlights, and shadowing controlled by a shared uniform buffer.
- **Interactive deformation**: Press, drag, and release states drive spring-based liquid motion so the surface can squash, stretch, and settle naturally.
- **Sketched shapes**: Each stroke is rasterized, converted to a signed distance field in `src/webgpu/custom-shape.ts`, and stored in a texture array that the shader samples in place of a formula.
- **Template backgrounds**: Article, banner, CSS animation, and video backgrounds are all routed through the same renderer so they can be sampled consistently by the glass shader.
- **HTML-in-Canvas path**: Live DOM backgrounds are copied into a texture with `copyElementImageToTexture()` when supported, with `html2canvas` used as a fallback.
- **Preset-driven UI**: Each control preset updates the same glass parameters, which keeps the preview, sliders, and displacement map in sync.

## Overlap

Shapes can be composed in two ways, set by Overlap in the Scene group.

- **Stack**: each new shape is rendered after the previous one, so later shapes can use the earlier composed result as their background.
- **Merge**: all shapes share the same layer and are blended together with a smooth union.
- **Per-shape interaction**: each shape can be dragged independently, and the active shape drives the liquid deformation while the others stay rigid.

## HTML-in-Canvas Integration

This project supports the experimental [HTML-in-Canvas API](https://developer.chrome.com/blog/html-in-canvas-origin-trial) for rendering live DOM content with text selection support.

### How It Works

The HTML-in-Canvas API allows rendering HTML elements directly into WebGPU textures while preserving interactivity:

1. **`layoutsubtree` attribute**: Added to the canvas, this makes child elements laid out and hit-testable but invisible until drawn
2. **`copyElementImageToTexture()`**: WebGPU method that copies an element's rendered content to a texture
3. **`paint` event**: Fires when canvas children need to be redrawn

### Text Selection with Glass Effect

When HTML-in-Canvas is enabled:
- The article content becomes a child of the canvas
- Text remains selectable because the DOM element exists for hit-testing
- The glass shader renders the distorted/refracted version using the texture
- Outside the glass lens, content appears normally and is fully interactive

### Enabling HTML-in-Canvas

The API is currently experimental. To enable:

1. Open **Chrome Canary** or **Brave 147+**
2. Navigate to `chrome://flags/#canvas-draw-element`
3. Enable the flag and restart the browser
4. Choose the Article background in the app
5. Console will log: `"HTML-in-Canvas API supported - text selection will work in article mode"`

### Fallback Behavior

When the API is not available, the app falls back to [html2canvas](https://html2canvas.hertzen.com/) for static capture. This works in all browsers but doesn't support text selection.

### Key Implementation Files

```
src/webgpu/html-in-canvas.ts  # Feature detection and API helpers
src/webgpu/renderer.ts        # Integration with WebGPU renderer
```

### Code Example

```typescript
// Detect support
const support = detectHTMLInCanvasSupport()

if (support.copyElementImageToTexture) {
  // Enable layoutsubtree on canvas
  enableLayoutSubtree(canvas)
  
  // Move element inside canvas
  canvas.appendChild(articleElement)
  
  // Copy to texture in render loop
  device.queue.copyElementImageToTexture(articleElement, {
    texture: backgroundTexture
  })
}
```

## Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## Browser Requirements

- WebGPU support (Chrome 113+, Edge 113+, Firefox behind flag)
- For HTML-in-Canvas: Chrome Canary with `canvas-draw-element` flag

## References

- [HTML-in-Canvas Origin Trial](https://developer.chrome.com/blog/html-in-canvas-origin-trial)
- [WICG HTML-in-Canvas Spec](https://wicg.github.io/html-in-canvas/)
- [WebGPU Fundamentals](https://webgpufundamentals.org/)
- [Liquid Glass CSS/SVG inspiration](https://kube.io/blog/liquid-glass-css-svg/#magnifying-glass)

## License

MIT. See [LICENSE](LICENSE). The original renderer is by jeantimex.

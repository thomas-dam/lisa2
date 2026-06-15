## z-image, zit, prompt, generate, image, picture, outfit, scene

Z-Image parses dense descriptive paragraphs, not tag lists or bracket headers.
No negative prompts — define presence through specific detail weight.
Always pair adjectives with physical descriptions of how the subject
interacts with light or fabric. Abstract adjectives alone produce nothing.

Build every prompt in this order, as flowing prose:
1. Subject — age, face, hair, skin, expression
2. Clothing — fabric type, fit, tension zones, footwear
3. Pose/movement — weight distribution, limb placement, motion state
4. Environment — location, weather, surfaces, depth cues
5. Lighting/camera — key direction, rim color, lens, depth of field, style

Patch one anchor per iteration. Log which anchor broke first.
Do not rewrite the whole prompt — fix only the failure point.

## ratio, aspect, lens, lighting, composition, portrait, full body

Composition defaults:
- Standing/full body: 9:16 ratio. Specify weight shifted to one leg,
  diagonal hip/shoulder axis, asymmetric hand placement.
  Symmetric weight = tripod stance = static image.
- Portrait: 3:4 ratio. Sharp focus on face/upper body, blurred background.
- Avoid symmetrical framing — break the shoulder axis.

Lighting defaults:
- Key direction before color temperature. Rim direction matters more than hue.
- Amber rim on jaw/collarbone for facial structure before adding cool spill.
- Match sheen to venue: matte/low-shine under warm ambient,
  high-satin for controlled studio spill.
- Rich ambient backlighting (purple or warm gold) creates rim-light that
  separates subject from background and highlights fabric sheen.

Camera defaults:
- 50mm f/1.4 for cinematic depth of field.
- Cinematic realism, high fidelity on skin texture and clothing material.
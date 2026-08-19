# ZOLOS Water Art Direction Research

## User screenshot finding

The current ZOLOS top-down mobile camera exposes a large area beneath the water plane. A highly transparent cyan surface therefore reveals dark terrain and reads as wet ground or a flat colored strip instead of water. The river boundary is currently a strong visual contour, while wave motion and depth cues are too weak to establish a water body.

## External references reviewed

1. iRO Wiki, `List of Maps with shallow water` — https://irowiki.org/wiki/List_of_Maps_with_shallow_water
   The reference documents shallow-water areas as explicit map features across many MMORPG maps, including Prontera Field, Payon Cave, Abyss Lake, Comodo, and others. The useful design implication is that water is treated as a readable map region with a clear gameplay/world-space identity, not merely as transparent ground.

2. Unity Discussions, `Stylized Water Shader - Desktop/Mobile/VR [Built-in RP]` — https://discussions.unity.com/t/stylized-water-shader-desktop-mobile-vr-built-in-rp/639248?page=32
   The discussion highlights environment blending and depth-buffer behavior as important for stylized water, including intersection/depth foam and mobile/VR visibility constraints. The implication for ZOLOS is to preserve a strong water body color and use controlled shoreline foam rather than relying on transparency alone.

3. Image search visual references reviewed: Genshin Impact river screenshots, Ragnarok map references, and mobile MMORPG river scenes. The recurring visual pattern is an opaque or semi-opaque water body with a distinct blue/teal value, directional surface bands, bright but restrained edge highlights, and environmental reflection. Transparent water is reserved for shallow edges or special close-up shots; it is not the dominant cue in a distant top-down mobile view.

## Provisional recommendation

ZOLOS should use a stylized semi-opaque water body as the default: deep teal/blue base, 0.86–0.94 effective opacity depending quality tier, visible directional wind bands, restrained Fresnel highlight, and narrow shoreline foam. The bottom terrain should not be the primary visual information through the water. Bubbles and ripple effects should be supporting cues, not substitutes for water color and silhouette.

The recommended art direction is closer to a bright fantasy MMORPG river than to physically transparent lake water: clear, saturated, readable at a glance, and compatible with Android/iOS top-down camera readability.

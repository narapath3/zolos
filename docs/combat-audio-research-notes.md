# ZOLOS Combat Audio Research Notes

## Audiokinetic — Route, Prioritize, Adapt: Wwise Tactics for Combat Audio Mixing
Source: https://www.audiokinetic.com/en/community/blog/enotria-the-last-song/

Key findings from the official Audiokinetic case study on *Enotria: The Last Song*:

- Combat audio must remain readable when melee, magic, parry, damage, music, ambience, and UI events overlap.
- The team categorized audio early by macro categories and frequency range, then tested events in gameplay prototypes.
- Each weapon class and magic spell received a distinct tonal identity so attacks could be recognized without visual support.
- A scalable bus structure separated weapon whoosh, damage, finisher, parry, impact, environment impact, heavy ground impact, UI, and enemy-slain feedback.
- Surface impacts were separated by material such as dirt, rock, stone, wood, and water; this is a useful model for ZOLOS bridge, grass, stone, and water impacts.
- Damage feedback and parries were treated as high-priority signals. Other layers were dynamically ducked or filtered to preserve them.
- Finisher/enemy-slain feedback was treated as an extra-diegetic cue that should remain audible even when the mix is busy.
- Sidechain and prioritization rules were preferred over simply making every effect louder.
- The case study used RTPC-style adaptive mixing; in ZOLOS this can be approximated with Web Audio gain nodes, short ducking envelopes, category cooldowns, and priority-aware voice limits.

## Initial ZOLOS design implications

1. Build combat sounds from short layers: anticipation/whoosh, tonal weapon or spell identity, contact/impact, and optional finisher accent.
2. Keep basic hit sounds compact and lower in loudness than critical/finisher cues.
3. Give sword, magic, bow/gun, elemental, critical, and finisher events separate frequency and timbral identities.
4. Add a lightweight combat ducking bus that briefly lowers ambience/music rather than increasing attack volume excessively.
5. Use voice throttling and deterministic variation to avoid harsh repetition on mobile.
6. Keep all generation procedural through Web Audio API; no external audio files are required.

## Research status

This is the first source. Additional sources should cover practical sword-layer construction, magic spell sound construction, and mobile loudness/mixing constraints before implementation.

Recorded by Manus AI on 2026-08-20.

## References

[1]: https://www.audiokinetic.com/en/community/blog/enotria-the-last-song/ "Audiokinetic — Route, Prioritize, Adapt - Wwise Tactics for Combat Audio Mixing"

## Additional source notes

The initial search also identified practical references to follow up:

- https://www.daviddumaisaudio.com/the-4-secret-layers-behind-epic-sword-sound-effects/
- https://www.daviddumaisaudio.com/how-to-make-sword-sound-effects/
- https://aaltodoc.aalto.fi/items/5cd45ea5-3afe-428b-a01a-a60a53d7f91d
- https://www.airwiggles.com/c/gameaudio/loudness-and-metering-in-game-audio
  

## David Dumais Audio — The 4 Secret Layers Behind Epic Sword Sound Effects
Source: https://www.daviddumaisaudio.com/the-4-secret-layers-behind-epic-sword-sound-effects/

Key findings:

- A sword attack is most convincing when built from four layers: weapon swing/whoosh, scrape or material identity, hit/contact impact, and enhancer layers.
- Basic attacks can use swing + scrape + impact, while optional enhancers add variation without changing the core identity.
- Power attacks shift emphasis toward a larger whoosh and thunderous enhancer to communicate scale.
- A final blow can be differentiated by lowering pitch, adding a longer reverb tail, and using stronger enhancers rather than merely increasing every layer's gain.
- The article warns that relying on one isolated sound tends to feel thin; layering and contextual variation create depth.
- For ZOLOS, the procedural equivalent should use a short filtered noise whoosh, a metallic/weapon tonal layer, a transient impact, and optional critical/elemental/finisher accents. The final blow should receive lower pitch, a controlled low-frequency body, and a restrained tail.

Caveat: the article explicitly states it was generated and written by AI, so it is treated as a practical design reference rather than a peer-reviewed or studio postmortem. The Audiokinetic case study remains the stronger primary reference for production architecture.

Recorded by Manus AI on 2026-08-20.

[2]: https://www.daviddumaisaudio.com/the-4-secret-layers-behind-epic-sword-sound-effects/ "David Dumais Audio — The 4 Secret Layers Behind Epic Sword Sound Effects"

## Grinding Gear Games — Skill Sound Design in Path of Exile 2
Source: https://www.pathofexile.com/forum/view-thread/3794832

Key findings from Senior Sound Designer Dominic Downing's official production breakdown:

- A skill sound must communicate gameplay purpose: danger, impact, safety, damage type, area of effect, damage-over-time state, utility, projectile state, and repeat/firing cadence.
- The team collaborates with designers, animators, programmers, and tests early in the game across builds, areas, and support modifiers. The lesson for ZOLOS is to validate sounds in actual combat, not in isolation.
- Source material can combine recorded Foley, library assets, voice textures, and synthesis. For ZOLOS, procedural synthesis can substitute for these layers through filtered noise, oscillators, envelopes, distortion, and short resonators.
- Randomisation and layering prevent repetitive skill audio, but technical controls are essential: voice count, cooldowns, and party-context behavior.
- Combat audio should guide rather than overwhelm. Ducking, distance attenuation, and priority systems are used so danger and key feedback are not lost in a busy fight.
- A special skill's identity can combine a familiar base layer with unique layers. In the case study, the crossbow kept recognizable crossbow layers and added whispers, screams, metallic creaks, string-like hits, and subtle music.
- Pitch and gain modulation create variation; tonal layers that must remain in key should not be randomly pitch-shifted.
- Short activation, loop/flight, impact, and release layers can be controlled as one lifecycle event. For ZOLOS this maps to cast/charge, projectile/travel, hit/finish, and release states.
- The team created multiple short melodic variants and selected them by a counter/random parameter while avoiding immediate repeats. The same idea can be used for procedural combat timbre seeds.
- The most important production principle is contrast: making every large sound louder is less effective than making unimportant sounds more subtle.

## Initial ZOLOS design implications

1. Define skill events by lifecycle: cast/anticipation, travel/whoosh, contact/impact, status/elemental tail, and release/finisher.
2. Add event metadata such as damage type, weapon class, target material, critical flag, finisher flag, priority, and distance.
3. Use local voice limits and per-category cooldowns so rapid attacks do not create a harsh wall of sound on iOS/Android.
4. Use deterministic/non-repeating variation for repeated attacks, while preserving pitch for musical/tonal identity layers.
5. Treat the player's own damage, enemy danger, parry, critical, and finisher as the top audible priorities.
6. Implement modest short ducking of ambience/music and lower-priority SFX during high-priority combat events.

Recorded by Manus AI on 2026-08-20.

[3]: https://www.pathofexile.com/forum/view-thread/3794832 "Path of Exile 2 — Skill Sound Design"

## Unity Manual — Audio Mixer window
Source: https://docs.unity3d.com/6000.5/Documentation/Manual/AudioMixer.html

Key findings:

- A professional mixer is organized as a tree of audio groups/buses. Each group can process a signal chain, control volume/pitch, and route via sends/returns.
- Snapshot-style parameter sets can transition between moods/themes; in ZOLOS this supports future combat, exploration, boss, and night ambience profiles.
- Ducking is explicitly described as altering one group based on another event, for example reducing ambience while an important event happens.
- The web platform has partial Audio Mixer support in Unity, so the ZOLOS implementation should keep the architecture lightweight and native to Web Audio API rather than relying on a heavyweight middleware runtime.

## ZOLOS design implications

Create logical Web Audio buses even without external audio assets: Master, Music, Ambience, Combat, CombatPriority, UI, and Voice. Route generated nodes through these buses. Use short gain envelopes for ducking and category-level volume controls for a future Settings panel. Keep the combat system independent from environmental ambience so combat can be made clearer without raising global loudness.

Recorded by Manus AI on 2026-08-20.

[4]: https://docs.unity3d.com/6000.5/Documentation/Manual/AudioMixer.html "Unity Manual — Audio Mixer window"

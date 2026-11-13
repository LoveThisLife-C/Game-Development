# Blackout Ridge Image Assets

## Brand identity

`logo2.webp` is the user-provided primary Blackout Ridge logo. The game uses it
on the title screen, compact runtime HUD, assembly screens, and legacy top bars.
Its frozen silver, cold black-blue, mountain texture, transmitter glow, and
emergency-red waveform define the interface palette.

`ui/game-header-art-v4.webp` is the reusable header border generated with
the built-in image tool using the Act 1 console chassis as a style reference.
Its two widely spaced transparent, sculpted metal rails frame the live content
with cyan seams, tapered side caps and restrained emergency lights. The frame
is artwork, not a CSS border, and is prepared at the runtime header's wide
aspect ratio to avoid compressed or oversized details.
It contains no lettering or logo: the existing `logo2.webp` and live
labels remain separate, readable interface elements. The same backdrop is
used by the entry, lobby, operational HUD, Act 1 and Act 2 header surfaces.

## Environment set 01

Generated with the built-in image-generation tool for direct use by the game
prototype. The shared direction is grounded, cinematic operational horror:
believable UK upland infrastructure, storm pressure, worn industrial materials,
restrained practical lighting, no supernatural threat, no villainous system,
and no watermarks. The game UI applies the separate logo-led red/steel identity
over these environment plates.

| File | Prompt summary | Intended use |
|---|---|---|
| `first-screen-v2.webp` | New 16:9 opening background derived from the original mood reference and `logo2.webp` palette; storm ridge, right-positioned relay, red beacon, clean left-side UI space | Interactive game title screen |
| `icon-private-signal.webp` | Distressed steel eye crossed by a broken signal waveform | Unequal-information briefing and private channel readouts |
| `icon-crew-link.webp` | Three linked field operators around a relay signal | Crew-size briefing and crew-channel access |
| `icon-seven-relays.webp` | Seven mechanical relay contacts around an alarm beacon | Challenge briefing and command authority |
| `icon-shift-timer.webp` | Rugged mission timer, lightning strike, and radio mast | Shift duration and station boot control |
| `control-host-authority.webp` | Master key and guarded relay switch | Host authority selection and session arming |
| `control-crew-channel.webp` | Field radio in a secure terminal cradle | Join controls and private-channel connection |
| `control-duo-terminals.webp` | Two linked operator stations | Combined-role terminal concept |
| `control-six-terminals.webp` | Six consoles around a beacon | Six-player configuration |
| `control-seven-terminals.webp` | Seven consoles around a beacon | Seven-player configuration and lobby status |
| `control-code-auth.webp` | Six-key signal lock | Relay-code authentication |
| `control-copy-link.webp` | Locking signal connectors | Secure crew-link transfer |
| `control-shared-display.webp` | Armored room-facing command display | Shared-display launch control |
| `control-start-emergency.webp` | Guarded emergency lever | Start-game authority control |
| `role-lead.webp` | Command key and responsibility compass | Station Lead / Command & Field selection |
| `role-signal.webp` | Antenna and spectrum analyzer | Signal Analyst / Signal & Systems selection |
| `role-systems.webp` | Dependency circuit and relay gear | Systems Engineer selection |
| `role-operations.webp` | Bounded route map and control switch | Operations Officer selection |
| `role-field.webp` | Binoculars and human-location trail | Field Liaison selection |
| `role-protocol.webp` | Safety shield and mechanical interlock | Protocol Officer selection |
| `role-comms.webp` | Broadcast microphone and readback loop | Comms Officer selection |
| `device-mission-terminal.webp` | Frozen, weather-damaged steel analysis terminal with a blank smoked-glass live display | Physical title-screen mission briefing instrument |
| `device-station-engage.webp` | Heavy iced relay engagement console with guarded lever, beacon, gauge, and cabling | Physical title-screen station power interaction |
| `runtime-selector-module.webp` | Iced guarded selector with illuminated pilot and blank live label plate | Decision options, facilitator switches, and native-input replacement |
| `runtime-commit-lever.webp` | Compact interlocked red command lever on a frozen steel base | Commit, resolve, report, and override actions |
| `runtime-radio-console.webp` | Weathered field radio with waveform hardware and a blank cracked-glass display | Shared station feed and private crew communication |
| `runtime-telemetry-rack.webp` | Tall three-bay relay instrument spine with gauges, meters, and blank readouts | Shared and facilitator station-state instrumentation |
| `station-exterior.webp` | Remote weather-beaten relay station on an exposed ridge at night; violent storm, mast beacon, access road, distant Calder Vale incident; wide grounded industrial realism | Opening cinematic, lobby, storm escalation |
| `relay-control-room.webp` | Cramped relay control room mixing aging analog equipment and modest modern monitors; rain windows, empty chair, mug, coat; calm but subtly wrong | Handover, Live Circuit, shared console |
| `outside-run.webp` | First-person flooded service-road inspection; flashlight, unopened repeater, conduit turning beneath station; physical clues readable without labels | Outside Run decision and evidence |
| `containment-hatch.webp` | Steel containment access below rack B; separate override, wet cables, pressure hardware, amber/cyan light | R-12 investigation and lock-control finale |
| `auxiliary-relay-hold.webp` | Forgotten lower workplace with relay desks, bunks, mugs, masks, scripts, shallow water and calm green indicators | Buried workplace reveal and Lark evidence |
| `mara-venn-below.webp` | Competent exhausted engineer alive below, using wired radio beside respirator and sealed pressure door; intimate human realism | Mara signal, rescue stake, finale |
| `calder-vale-cordon.webp` | Emergency/hazmat cordon at the valley materials site in heavy rain, with ridge mast above; controlled urgency, responders not villains | Military traffic and External Trust |
| `lark-shift-archive.webp` | Scanned late-1970s/early-1980s workplace photo of exactly five ordinary relay technicians inside the hold | Historical evidence card and debrief |

## Production constraints used in every prompt

- No readable generated text, logos, or watermark
- No cyberpunk, spaceship, glossy science-fiction, or fantasy design language
- No monsters, supernatural effects, gore, skulls, or villain imagery
- Human-scale engineering and credible worn materials
- Wide compositions with room for interface overlays, except the deliberately
  4:3 archival photograph

Original generated files are retained by the built-in image tool. These project
copies are the versions consumed by the prototype.

## Act 1 cinematic set

Generated with the built-in image-generation tool on 10 September 2026. These
frames deliberately show a functional station before the emergency and exclude
Mara, Lower Route, Lark Shift, R-12, chemical hazards, damage, and anomalous
imagery.

| File | Final prompt summary | Intended timing |
|---|---|---|
| `act1/act1-approach-v1.webp` | Photorealistic 16:9 utility-vehicle approach along a wet ridge road; operating mast ahead, distant lightning, routine isolation | Opening approach, approximately 0–12 seconds |
| `act1/act1-station-exterior-v1.webp` | Photorealistic 16:9 close exterior of the operational cabin, mast, generator and parking in light rain | Station establishment, approximately 12–23 seconds |
| `act1/act1-control-room-v1.webp` | Photorealistic 16:9 recently occupied control room with intact equipment, green displays, rain windows and no emergency clues | Interior handover lead-in, approximately 23–35 seconds |

Shared prompt constraints: cinematic grounded game environment; cool rainy night,
restrained warm practical light, believable infrastructure, safe central crop,
no baked-in UI text, logo, watermark, emergency damage, overt horror, or future
story revelations.

## Act 1 raster UI direction

Generated with the built-in image-generation tool using the client-provided
operational-dashboard image as a style and composition reference. Runtime
artwork contains no authoritative gameplay copy.

| File | Final prompt summary | Intended use |
|---|---|---|
| `act1/act1-console-chassis-v1.webp` | Empty physical relay-console chassis with a large glass workspace and twelve illuminated status housings | Live image-led Act 1 facilitator and player console surface |
| `act1/act1-local-site-map-v1.webp` | Cinematic illustrated relief map of the Ridge site, connected roads and Calder Vale | Live player CURRENT LOCAL MAP evidence artwork |

Integration rule: retain the illustrated hardware, material, lighting and panel
language; populate dynamic names, records, captions, timer values and system
states from the game engine so generated lettering never becomes authoritative.
The live interface displays `logo2.webp` directly, rather than generated logo
lettering, so the official mark remains exact at every viewport size.

### Client-supplied Act 1 UI panels

The seven files under `act1/client-ui/` are WebP reference copies of the
canonical private-screen graphics embedded in the client handoff document.
They are retained for visual comparison but are not rendered inside player
screens because their baked-in alternative logo and timer would duplicate the
official live interface. Their icon, color and typography direction is carried
by the generated icon set and live semantic records. The generated local-site
map remains in use for the map terminal at the user's request.

## Act 7 evacuation plates

The Act 7 batch extends the established wet industrial horror language across
the critical cabin, physical transfer sequence, protected R-12 room and its
private investigation hotspots. These plates are WebP runtime artwork; all
authoritative instructions, values, names and state remain live HTML from the
game engine.

| File group | Intended use |
|---|---|
| `act7/opening-critical-cabin-v1.webp` | Critical cabin backdrop when the final evacuation opens |
| `act7/transfer-*.webp` | Hatch, seal chamber and purge apparatus during physical transfer |
| `act7/r12-protected-room-v1.webp` | Protected refuge fallback and room context |
| `act7/hotspot-*.webp` | Private R-12 investigation views for Mara, CCTV, receiver, manuals and final console |

## Act 6–7 production cinematics

The production frame set under `act6/production/` and `act7/production/` replaces
storyboard boards in the live runtime. The deterministic builder at
`scripts/build-act67-cinematics.py` turns those clean, text-free WebP plates
into synchronized H.264/AAC sequences under `prototype/assets/media/`.

| File group | Intended use |
|---|---|
| `act6/production/nightmare-*.webp` | Fixed-camera nightmare progression without an impossible tower reveal |
| `act7/production/walk-*.webp` | Increasingly altered private cabin walks before each transfer |
| `act7/production/power-failure-v1.webp` | Emergency reserve generator and relay failure transition |
| `act7/production/ending-f01-v1.webp` through the five numbered ending plates | Five outcome-specific final films and poster fallbacks |

All captions and controls remain live HTML. The MP4 start position is derived
from server timestamps so refreshed shared, player, and facilitator screens
resume the same point in each sequence.

## Act 1 generated icon instruments

The sixteen transparent WebP assets under `act1/icons/` were generated as one
consistent 4×4 industrial icon atlas and mechanically separated without visual
redesign. They cover the seven evidence categories, handover roster, four
player workflow actions, facilitator console, and three live review states.
They are the visible icon layer for record tabs, headers, staff status modules,
task modules and the facilitator completion control. Semantic HTML remains
underneath for input, keyboard access, live synchronization and screen readers.

## Ending control icons

The four transparent assets under `ending/icons/` were generated as a single
consistent physical-control strip and separated into final-record, restart,
preserve-record and return-to-Act-1 controls. They appear in both the first
Stage 7 result overlay and the finalized-session replay modal.

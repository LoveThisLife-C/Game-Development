# Blackout Ridge — implemented game runtime

## Experience model

The build has four modes:

1. **Game start** — a full-screen, in-world station startup sequence.
2. **Shared station** — the room-facing world view, clock, crew state, evidence,
   system record, and visible consequences.
3. **Private role instrument** — one player’s evidence, crew report channel,
   role override, and the Station Lead’s decision controls.
4. **Facilitator control** — stage decisions, live reports, timers, prompts,
   safety pause, station state, and event history.

Authenticated player and facilitator views also include a persistent Crew Chat
channel for typed discussion. New messages use the same live synchronization as
game state and raise an unread alert on other member terminals. The public room
display cannot read or post chat messages.

All modes consume the same authoritative session state. A player never receives
another role’s private evidence.

## Crew configurations

The runtime supports the production specification's four-, five-, six-, and
seven-player configurations. Responsibilities combine without removing any
evidence lens:

- **4 players:** Command & Protocol; Signal; Systems; Operations & Field.
- **5 players:** Lead; Signal; Systems; Operations; Field & Protocol.
- **6 players:** the six core roles.
- **7 players:** the core roles plus Comms.

## Seven-stage runtime

1. Reconcile whether six outgoing staff members actually departed, using
   different records distributed across the crew's private terminals.
2. Choose and assign one failed system per player, then run distinct private
   repair games simultaneously while outside traffic continues.
3. Diagnose two field locations and lock route order plus two specialist items.
4. Execute both locked field services through asymmetric runner/station games.
5. Keep the cabin breathable through a four-minute rotating control game; the
   sustained result determines investigation time before R-12 reveals Mara.
6. Investigate the Lark Shift archive, then teach every player the R-12 rules
   and three-part final surface procedure.
7. Descend into R-12 in a hidden random order, manage shared refuge air, and
   have the final surface operator complete the learned rescue procedure alone.

Act 1 establishes shared understanding without scoring or later mechanical
state. From Act 2 onward, weak choices do not stop the game; they change station
capability, available evidence, trust, air safety, and the possible ending.

The Outside Run executes the two-location Act 3 plan without reopening route or
equipment. The runner sees and describes each installation; station players
interpret a separate procedure table and lock one instruction; the runner then
commits one action with no retry. A, B, C and D restore different operational
capabilities, and Act 2 still determines communications quality.

Act 5 gives every player the same compact cabin controls but enables only the
active role. Intake, airflow and filter state create visible tradeoffs under a
continuously rising plume. Working Air Quality exposes exact values; otherwise
players receive qualitative warnings. Restored Upper Ridge service enables two
finite purge charges. The sustained result grants 180–360 seconds for Act 6,
then an automatic integrity sweep reveals R-12 and Mara alive for every team.

Stage 6 uses that exact earned window. Its first half is a searchable historical
archive and its second half unlocks the R-12 operating archive. If Air Quality
is broken, only deadline precision is lost. Archive activity is not scored or
stored, and all terminals receive the same mandatory procedure: DISTRESS →
EXTRACTION MESSAGE → RELEASE CONFIGURATION. Stage 7 activates one short
physical transfer at a time. Players already below are isolated and may spend
shared purge cycles independently. The last hidden player receives a 30-second
surface dashboard before their own transfer. Final refuge endurance is compared
with the rescue delay created by effective status, message and release outcomes;
the facilitator confirms that calculated record before debrief.

Chemical air, lower-road flooding, storm damage, cordon trust, respirator state,
and the official-status race remain visible as incident telemetry. During the
Outside Run, the current site repeats the exact Act 3 arrival, service-completion
and concentration forecast as environmental reality; it creates no new gas
decision or withdrawal rule. Private role instruments can archive their current
brief as a text file for remote or accessibility workflows.

## Runtime architecture

- `server/server.js` — HTTP API, static delivery, event stream, persistence.
- `server/game-engine.js` — authorization, timer logic, consequences, endings.
- `server/game-content.js` — roles, stages, evidence, and decision options.
- `prototype/full-app.js` — the four browser modes and interaction routing.
- `prototype/audio.js` — opt-in ambience, feedback cues, and queued voiced transmissions.
- `prototype/network.js` — REST actions, state loading, and reconnecting events.
- `prototype/styles.css` — cinematic full-viewport game presentation.

## Session operation

1. Run `npm run dev` and open `http://localhost:4173`.
2. Engage the station, choose Command Authority, and arm a four-to-seven-terminal shift.
3. In the assembly screen, copy the crew link and open the shared display.
4. Players claim roles. Read the participant-care statement and confirm it in
   the facilitator console; the shift cannot start until this is done.
5. Players discuss their private evidence by voice and submit short written
   recommendations to the Station Lead. The facilitator can also see these
   reports; other role terminals see readiness, not the private report text.
   Crew Chat is available as a typed discussion channel for remote sessions or
   accessibility needs.
6. The facilitator records Stages 1–3 collective decisions; from Stage 4 onward,
   the Station Lead or facilitator can commit the agreed plan.
7. During Stage 4, the runner and station crew complete two sequential
   observation → interpretation → instruction → action service games.
8. Everyone reads the synchronized cause-and-effect reveal: the exact
   commitment, what changed, updated tracks, and why the next stage happens.
9. The facilitator advances after each consequence reveal and confirms the
   calculated final record after Stage 7.
10. Use the synchronized six-step debrief to reconstruct status failures, map
   roles, diagnose hesitation, bridge to AI-enabled work, and capture one bounded
   first step from every participant. Export the complete session record as JSON.
11. After a pilot, open the prototype playtest record, rate all seven playbook
    criteria, record observations, and choose proceed, revise, or stop/reframe.

Before commitment, player, shared, and facilitator views show a decision
preview. It names what the current draft preserves or enables, what it costs or
exposes, any unresolved warning, and whether the draft is ready. Private
Participant Notes use the same plain-language sequence in every role: **What
you know → Confidence → Why it matters → What to say out loud → Your
recommendation**.

The audio control is deliberately opt-in because browsers block autoplay and
workshop participants may need reduced stimulation. The shared station queues
the voiced Act 1–3 transmissions while always retaining the same transcript on
screen.

## Validation

`npm run check` validates all JavaScript entry points. `npm test` covers complete
high-quality and fail-forward paths plus access-control and timing rules. The
runtime has also been visually checked at 1440×900 for the shared, facilitator,
and private-player modes.

Validation captures: [cinematic video startup and station lever](screenshots/video-boot-background.webp),
[mobile station boot](screenshots/realistic-boot-terminal-mobile.webp),
[borderless authority controls](screenshots/icon-first-authority.webp),
[icon-first terminal configuration](screenshots/icon-first-host-setup.webp),
[secure code hardware](screenshots/hardware-code-auth.webp),
[borderless role instruments](screenshots/icon-first-role-join.webp),
[icon-first host assembly](screenshots/icon-first-host-lobby.webp),
[physical shared-station runtime](screenshots/runtime-hardware-shared.webp),
[mechanical facilitator controls](screenshots/runtime-hardware-facilitator.webp),
[private field instrument](screenshots/runtime-hardware-player.webp),
[mobile player instrument](screenshots/runtime-hardware-player-mobile.webp),
[physical consequence reveal](screenshots/runtime-hardware-consequence.webp),
[stage-specific cinematic consequence](screenshots/runtime-realistic-modal.webp),
[collision-free short-screen telemetry](screenshots/runtime-readable-telemetry.webp),
[prominent live-stage HUD](screenshots/runtime-stage-header.webp),
[playable Outside Run](screenshots/game-logic-outside-run.webp),
[mobile Outside Run](screenshots/game-logic-outside-run-mobile.webp),
[facilitator game controls](screenshots/game-logic-facilitator.webp),
[cinematic Clean Rescue](screenshots/clean-rescue-final.webp),
[short-screen Clean Rescue](screenshots/clean-rescue-short.webp),
and [mobile Clean Rescue](screenshots/clean-rescue-mobile.webp).

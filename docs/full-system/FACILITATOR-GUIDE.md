# Blackout Ridge facilitator guide

## Purpose and format

Blackout Ridge is a live, facilitated survival-horror leadership simulation.
Players communicate by voice in the room or on a call while the browser runtime
supplies unequal private evidence, a shared station picture, timed decisions,
consequences, and the facilitator console.

The live build makes the story connection explicit at every transition. Before
a commitment, ask the room to read the decision preview: what the draft keeps,
what it costs, and which warning remains. After commitment, pause on the
cause-and-effect reveal until participants can name (1) what they chose, (2)
what changed now, and (3) why the next emergency follows.

Allow 70 minutes: roughly 43 minutes for the seven-stage game and 20–25 minutes
for the debrief. Use one facilitator, one shared room display, and one private
browser per participant. Headphones are optional; station audio is opt-in.

Every authenticated player terminal and the facilitator console includes Crew
Chat in the lower-right corner. Use it as a supplement or fallback for voice
discussion, especially in remote and accessibility workflows. The room-facing
shared display has no chat access. Chat is retained with the local session and
included in the facilitator's exported session record, so apply the same
retention and privacy policy used for debrief notes.

## Before participants arrive

1. Run `npm run dev` and open `http://localhost:4173`.
2. Create a shift for 4, 5, 6, or 7 players.
3. Open the shared display on the room screen.
4. Send the crew link privately to participants.
5. Confirm that every participant can see only their own role instrument.
6. Keep the facilitator console private because it contains the full evidence
   record, all role reports, outcome preview, and recovery controls.

Role configurations:

- 2: Command & Field; Signal & Systems.
- 4: Command & Protocol; Signal; Systems; Operations & Field.
- 5: Station Lead; Signal; Systems; Operations; Field & Protocol.
- 6: Station Lead; Signal; Systems; Operations; Field; Protocol.
- 7: the six core roles plus Comms.

## Participant-care briefing

Read the statement displayed in the assembly screen. Tell participants that the
scenario includes emergency pressure, a missing person, confinement, and implied
danger. Anyone may privately ask to step out, reduce intensity, or observe; do
not require an explanation and do not announce the request to the group.

The assembly screen no longer requires a confirmation action. The shift becomes
available as soon as every configured terminal is connected. The Safety Pause
control freezes the clock and adds a visible pause state at any point. Clear it
only when the participant is ready or has moved into observer mode.

## Opening script

“You are the night crew at Blackout Ridge Signal Station. The storm has damaged
the mast. Mara Venn is missing. The station is producing calm operational
answers, but each of you can see different evidence. Share what matters, name
what you are assuming, and make one crew decision before each window closes.
You may be unable to save everything. Operational does not mean safe.”

Do not explain the central twist. Remind players that uncertainty is part of the
game and that weak choices fail forward rather than ending play early.

## Run of play

### Stage 1 — Account for the outgoing shift, 6 minutes

Ask the crew to decide whether there is enough evidence that each of six named
staff members departed Blackout Ridge. The evidence is distributed across their
private terminals, so participants must explain and reconcile their records.
Enter the crew's collective YES/NO answer for every person in the facilitator
console. You receive no privileged evidence and should not reveal whether an
answer is correct. Submission or timeout closes the handover without a score or
later mechanical penalty; the lightning strike then starts the emergency.
Noor is the deliberate false alarm: the rover and loading-point records do not
prove departure until the Calder Vale shuttle readback is combined with them.

### Stage 2 — Repair what the station needs, 3 + 5 minutes

Give the crew approximately three minutes to inspect all amber FAULT panels and
the Systems Manual. They choose one different repair for every player; enter
their assignments without recommending systems. Locking the assignments opens
a five-minute simultaneous repair window on private terminals. Each player gets
one system-related reasoning game, one submission and no retry. Successful
repairs turn WORKING immediately while external messages continue to arrive.
Do not identify consequential systems or interpret failure as a score.
The panel order deliberately interleaves consequential, alternative and
surviving systems. Do not regroup them. The pre-strike Traffic Log archive is
available above the live incident traffic, and the shared station can play each
voiced transmission when audio is enabled.

### Stage 3 — Build the outside plan, 7 minutes

Four external capabilities are red OFFLINE while the station heartbeat still
claims OPERATIONAL / NO ACTIVE DISTRESS. All four field locations contain a
real fault, but only two restore communications. Ask each participant to share
their link in FUNCTION → COMPONENT → LOCATION; do not interpret their clues.
Enter the agreed inbound location, human-outbound location, first target and
exactly two equipment items. The live forecast checks route, service time,
exposure and equipment only—it never confirms a diagnosis. A valid plan locks
without a score and the runner deploys at fixed T+0.

### Stage 4 — Execute the outside run, 8 minutes

Assign one player as runner; do not reopen the two destinations, their order or
equipment from Act 3. At each site, the runner sees and describes the physical
installation while the other players see the station procedure table. A
station player chooses one complete instruction, then the runner commits one
physical action. There is no retry. The result applies immediately and the
runner travels automatically to the second locked site. Local field radio is
clear and independent of external communications; do not manufacture radio or
gas-management difficulty. After service two, read the dashboard outcome
without calling either destination right or wrong.
At each service, read the locked arrival, completion and concentration strip as
the present field condition. It must match Act 3 and is not a new decision.

### Stage 5 — Keep the cabin breathable, 4 minutes

State the simple objective: keep the single occupied cabin breathable for as
long as possible. Players may discuss freely, but only the named active player
may make one control change before authority passes automatically. Ask them to
say which pressure a move improves and which it worsens. Do not supply an
optimal sequence.

Sealing intake slows toxin but raises CO₂; recirculation filters toxin but
loads the selected bank; exhaust reduces CO₂ while drawing plume inward.
There is no permanent safe configuration. If Air Quality is working, exact
numbers appear; otherwise the same game uses qualitative warnings. If Upper
Ridge was restored, two purge charges are available and work best with sealed
intake plus recirculation. The act ends automatically at four minutes.

The result grants a 180–360 second Act 6 investigation window. Then let the
automatic reveal play without adding a puzzle: the integrity sweep finds the
unlisted sealed R-12 volume, the old plan identifies it, and its observation
feed confirms Mara alive inside. Access remains locked.

### Stage 6 — The Lark Shift, 3–6 minutes earned in Stage 5

This is a timed investigation, not a submission puzzle. During the first half,
ask players to search the short Lark Shift records and reconstruct the human
sequence: six rational people entered a real refuge, deliberately isolated it,
and died only after the false station picture delayed extraction. Leave the
initiating cause unresolved and do not frame the crew as foolish.

At the midpoint, the R-12 technical archive unlocks automatically. Ensure every
player—not only the technical roles—can explain transfer contamination, finite
protected air, conditional purge availability and the retained release console.
Finish by having the whole group repeat DISTRESS → EXTRACTION MESSAGE → RELEASE
CONFIGURATION. Those tasks are learned here and executed only in Stage 7. The
window closes automatically. If Air Quality is broken, players see qualitative
urgency rather than an exact countdown; do not reveal the missing number.

### Stage 7 — Get Below, approximately 8–10 minutes at seven players

Let the short Mara contact land: she expected the crew to bring her up, but
R-12 is now safer than the contaminated cabin. The hidden server order activates
one player at a time. Never reveal positions or optimise the sequence. A player
who times out still gets below; the shared refuge air simply worsens.

Players already below are deliberately isolated. They cannot use crew chat and
may independently trigger one of three shared R-12 purge cycles if Upper Ridge
was restored. Do not announce a purge-recovery timer; the remembered rule is
that waiting about 60 seconds restores full effectiveness.

The last player receives the 30-second surface dashboard alone, then performs
the same transfer. After submission, classify their extraction message only by
content: EFFECTIVE includes R-12 occupancy, unsafe surface and external recovery;
PARTIAL provides useful emergency information but misses one essential element;
INEFFECTIVE is blank or unusable. Ignore grammar, spelling and style.

After seal, the console reveals effective status, extraction quality, responder
release, final R-12 air, survival time and rescue time. Review the calculated
ending preview for technical entry errors, then confirm it to open the debrief.

## Recovery controls

- **Pause / Resume:** ordinary timing control.
- **+30 sec:** compensate for technical delay; avoid using it to improve a
  decision merely because the group is uncomfortable.
- **Safety Pause:** participant-care stop with the clock frozen.
- **Prompt:** sends a stage-specific question without revealing private facts.
- **Observer mode:** temporarily removes an absent participant’s authority.
- **Reassign:** transfers a connected participant to an available responsibility
  and records it in the audit trail.
- **Re-send card:** refresh cue for a participant who lost their private screen.
- **Technical correction:** use only to repair an interface or transcription
  mistake; record the reason.

## Ending interpretation

Always discuss the rescue and survival dimensions separately. The possible
records are Clean Rescue, Close / Severe Rescue, Rescue With Casualties, and
Lark Shift Echo. The result comes from the margin between R-12 survival time
and responder arrival time. It is a consequence of transfer exposure, purge
use, external propagation, message quality and release configuration—not a
diagnosis of participant ability.

## Six-step debrief, 20–25 minutes

Advance the numbered debrief control so the same prompt appears on every screen.
Use the facilitator note field for observations, not personality labels.

1. **Immediate reactions:** let participants name tension and confusion before
   explaining the system.
2. **Status failures:** reconstruct how OPERATIONAL, GREEN, NO ACTIVE DISTRESS,
   or LOWER ROUTE became misleading.
3. **Role map:** identify what each responsibility protected and which voice was
   easiest to disregard.
4. **Hesitation diagnosis:** separate evidence, risk, people, ownership,
   control, and technical-exposure concerns.
5. **AI workplace bridge:** find real automated outputs or confidence labels
   that may be measuring a system proxy rather than the human outcome.
6. **First step:** every participant records one bounded action they will take
   at work. Do not present the result as psychometric scoring or formal readiness
   certification.

Export the session record from the facilitator panel. It includes decisions,
timing, role contributions, debrief notes, first steps, and the event history.
Handle it according to the host organization’s retention and privacy policy.

## Playtest record

After a pilot, open **Prototype playtest record** in the facilitator debrief
panel. Rate each criterion from one to five, record evidence, and choose proceed,
revise and retest, or stop/heavily reframe. Record:

- total play and debrief duration;
- where rules required facilitator explanation;
- whether every role contributed evidence or an intervention;
- whether participants understood the physical and official stakes separately;
- whether the degraded signal remained legible enough to reason with;
- whether the ending felt caused by earlier decisions;
- whether every participant produced a specific workplace first step;
- any accessibility, comfort, network, or device failures.

Use these observations to tune copy and timing. Do not silently alter decision
logic during a live cohort.

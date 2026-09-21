# Blackout Ridge — Four-Player Acceptance Test

Date: 7 September 2026  
Result: **PASS**

## Configuration

- Crew size: 4
- Assigned terminals: Command + Protocol, Signal, Systems, Operations + Field
- Full path tested: lobby, Stages 1–7, ending preview, Clean Rescue ending, debrief
- Views exercised: facilitator, shared station, desktop player, mobile player

## Step-by-step result

1. **Session setup and assembly — PASS**  
   Four participants joined and locked exactly four valid terminals. The two combined-role assignments were presented clearly and the participant-care gate worked.
2. **Stage 1: Account for Shift — PASS**  
   Private role evidence, recommendation submission, shared consequence messaging, and facilitator controls completed correctly.
3. **Stage 2: Repair Station — PASS**  
   Four distinct repair assignments were available. Repair controls, validation, one-submit/no-retry behavior, live status, and shared progress completed correctly.
4. **Stage 3: Plan Outside Run — PASS**  
   The four-person evidence set remained complete through combined terminals. Crew chat and the outside plan worked in desktop and mobile views.
5. **Stage 4: Execute Outside Run — PASS**  
   Runner, station, and facilitator views advanced together and exposed the intended result and consequences.
6. **Stage 5: Keep Cabin Breathable — PASS**  
   Strict turn rotation covered all four players. The current player, one-change rule, live air values, recent changes, and disabled controls were visually distinct and understandable.
7. **Stage 6: Investigate Lark Shift — PASS**  
   Narrative and technical archive material unlocked correctly, including the R-12/Mara evidence path.
8. **Stage 7: Get Below — PASS**  
   A randomized final surface operator received the isolated dashboard. All required inputs, transfer sequence, rescue comparison, and three-of-four crew-below state behaved correctly.
9. **Ending and debrief — PASS**  
   The facilitator previewed and confirmed a Clean Rescue result; facilitator and mobile-player debriefs rendered correctly.

## Verification

- 37 WebP screenshots captured successfully.
- 8 targeted four-player/crew-size/finale/Stage-5 engine tests passed.
- JavaScript syntax and asset validation passed.
- Asset library: 187 WebP files, 17.7 MiB, with no raw raster files.
- Visual review found no blocking overlap, clipped primary controls, or unreadably small instructional text in the representative four-player screens.

## Evidence

Screenshots are stored in [`screenshots/four-player-acceptance`](screenshots/four-player-acceptance/).

Key examples:

- [`04-assembly-lobby.webp`](screenshots/four-player-acceptance/04-assembly-lobby.webp)
- [`06a-shared-repairs-active.webp`](screenshots/four-player-acceptance/06a-shared-repairs-active.webp)
- [`13a-player-cabin-air-stage5.webp`](screenshots/four-player-acceptance/13a-player-cabin-air-stage5.webp)
- [`15b-final-surface-stage7.webp`](screenshots/four-player-acceptance/15b-final-surface-stage7.webp)


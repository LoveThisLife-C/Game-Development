# Blackout Ridge — Five-Player Acceptance Test

Date: 7 September 2026  
Result: **PASS**

## Configuration

- Crew size: 5
- Assigned terminals: Lead, Signal, Systems, Operations, Field + Protocol
- Full path tested: lobby, Stages 1–7, ending preview, Clean Rescue ending, debrief
- Views exercised: facilitator, shared station, desktop player, mobile player

## Step-by-step result

1. **Session setup and assembly — PASS**  
   Five participants joined and locked exactly five valid terminals. The Field + Protocol combined assignment was explicit and the participant-care gate worked.
2. **Stage 1: Account for Shift — PASS**  
   Private role evidence, recommendation submission, shared consequence messaging, and facilitator controls completed correctly.
3. **Stage 2: Repair Station — PASS**  
   Five distinct repair assignments were available. Repair controls, validation, one-submit/no-retry behavior, live status, and shared progress completed correctly.
4. **Stage 3: Plan Outside Run — PASS**  
   The full evidence set remained available through the combined terminal. Crew chat and the outside plan worked in desktop and mobile views.
5. **Stage 4: Execute Outside Run — PASS**  
   Runner, station, and facilitator views advanced together and exposed the intended operational results and consequences.
6. **Stage 5: Keep Cabin Breathable — PASS**  
   Strict turn rotation covered all five players. Current-player status, the one-change rule, live air values, recent changes, and disabled controls were visually clear.
7. **Stage 6: Investigate Lark Shift — PASS**  
   Narrative and technical archive material unlocked correctly, including the R-12/Mara evidence path.
8. **Stage 7: Get Below — PASS**  
   A randomized final operator received the isolated dashboard. Required inputs, transfer sequence, rescue comparison, and the four-of-five crew-below state behaved correctly.
9. **Ending and debrief — PASS**  
   The facilitator previewed and confirmed a Clean Rescue result; facilitator and mobile-player debriefs rendered correctly.

## Verification

- 37 non-empty WebP screenshots captured successfully.
- 8 targeted crew-size, combined-role, Stage 5, and finale tests passed.
- JavaScript syntax and asset validation passed.
- Visual inspection found no blocking overlap, clipped primary controls, or unreadably small instructional text in the representative screens.

## Evidence

Screenshots are stored in [`screenshots/five-player-acceptance`](screenshots/five-player-acceptance/).

Key examples:

- [`04-assembly-lobby.webp`](screenshots/five-player-acceptance/04-assembly-lobby.webp)
- [`06a-shared-repairs-active.webp`](screenshots/five-player-acceptance/06a-shared-repairs-active.webp)
- [`13a-player-cabin-air-stage5.webp`](screenshots/five-player-acceptance/13a-player-cabin-air-stage5.webp)
- [`15b-final-surface-stage7.webp`](screenshots/five-player-acceptance/15b-final-surface-stage7.webp)


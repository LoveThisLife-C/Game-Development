# Blackout Ridge — Seven-Player Acceptance Test

Date: 7 September 2026  
Result: **PASS**

## Configuration

- Crew size: 7
- Assigned terminals: Lead, Signal, Systems, Operations, Field, Protocol, Communications
- Full path tested: lobby, Stages 1–7, ending preview, Clean Rescue ending, debrief
- Views exercised: facilitator, shared station, desktop player, mobile player

## Step-by-step result

1. **Session setup and assembly — PASS**  
   Seven participants joined and locked seven standalone terminals. The full-crew roster and participant-care gate rendered correctly.
2. **Stage 1: Account for Shift — PASS**  
   Private evidence, recommendations, shared consequence messaging, and facilitator controls completed correctly.
3. **Stage 2: Repair Station — PASS**  
   Seven distinct failed systems were assigned, including the Communications player's Backup Power puzzle. Validation, one-submit/no-retry behavior, and shared progress completed correctly.
4. **Stage 3: Plan Outside Run — PASS**  
   Evidence from every standalone role remained private where required and combined into the complete crew picture. Chat and planning worked on desktop and mobile.
5. **Stage 4: Execute Outside Run — PASS**  
   Runner, station, and facilitator views advanced together and exposed the intended operational consequences.
6. **Stage 5: Keep Cabin Breathable — PASS**  
   Strict rotation supported all seven players. Current-turn status, one-change behavior, live air readings, recent changes, and disabled actions remained clear.
7. **Stage 6: Investigate Lark Shift — PASS**  
   The complete narrative and technical archive unlocked correctly, including R-12 and Mara evidence.
8. **Stage 7: Get Below — PASS**  
   A randomized final operator received the isolated dashboard. The required decisions, transfer sequence, and six-of-seven crew-below state behaved correctly.
9. **Ending and debrief — PASS**  
   The facilitator previewed and confirmed Clean Rescue; facilitator and mobile debrief views rendered correctly.

## Verification

- 37 non-empty WebP screenshots captured.
- Representative seven-player lobby, repair, Stage 5, and finale screens visually inspected.
- No blocking overlap, clipped primary controls, or unreadably small instructional text found.
- Crew-size, Stage 5, finale, full regression, syntax, and asset checks passed.
- The capture harness was extended to include the seventh valid repair fixture (`backup_power`); no production game defect was found.

## Evidence

Screenshots are stored in [`screenshots/seven-player-acceptance`](screenshots/seven-player-acceptance/).

Key examples:

- [`04-assembly-lobby.webp`](screenshots/seven-player-acceptance/04-assembly-lobby.webp)
- [`06a-shared-repairs-active.webp`](screenshots/seven-player-acceptance/06a-shared-repairs-active.webp)
- [`13a-player-cabin-air-stage5.webp`](screenshots/seven-player-acceptance/13a-player-cabin-air-stage5.webp)
- [`15b-final-surface-stage7.webp`](screenshots/seven-player-acceptance/15b-final-surface-stage7.webp)


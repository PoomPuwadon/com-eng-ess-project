# Next morning (saved 2026-11-18, after the usage-limit reset)

The user's list, kept close to their wording. (The race changes noted here earlier were committed in 25d073f.)

**Status 2026-11-18 night: every item below is DONE** (commits e12ca6c … 4bf2ccd on `feature/live-sprint`;
screenshots in `verification/next-morning/`). Still worth a look in the morning: the Fixture Scout's
readership data fills in over the first few 30-minute cycles (Wikimedia rate-limits anonymous clients),
so the marquee may change once it is complete; and a real two-player bout/race was simulated locally,
not run with two live players.

## 1. Boxing (VT-03)
**DONE: guard / punch / hit / knockdown (kit `box` pose, punches broadcast as `swing`); fighter kit for the round only; yellow arrow + floor chevrons + pulsing ring; damage 4–7 and 650 ms cooldown; ring placeholders removed.**
- Boxers have no animation: add punch / guard / hit / knockdown animation (kit poses: `fight` exists).
- "Objective: walk into the ring" needs a clear indicator of where the ring is: a moving arrow on the
  ground, or an arrow sticking out of the boxer's body pointing at the ring.
- Health drains too quickly: slow it down (server `server/realtime/boxing.js` damage / cooldown).
- During a round, boxers should be dressed like boxers (kit `makeFighter` look: shorts, gloves,
  mongkol, prajioud), then back to normal after.
- Remove the placeholder people in the ring (the static fighters/referee from `combatPavilion.js`).

## 2. Horse racing (VT-04)
**DONE: `speedFromTps` = 0.8 + 0.7·tps (25–40 s per lap for a fast clicker, tested); big live leaderboard on the right.**
- Speed is too high: clicking fast finishes far too quickly. Slow the race (`speedFromTps` / track length).
- Make the leaderboard much clearer and bigger.

## 3. Teleports
**DONE: full-screen "Teleporting… to <floor>" veil, shown before the floor builds.**
- When someone is teleported, make it clear to them that they are being teleported (their screen
  freezes while the floor loads): a visible "Teleporting…" overlay.

## 4. Football room (VT-02)
**DONE: `server/football/SCOUT.md` briefing (general rules only) in the scout prompt, wider candidate list, club following from Wikipedia readership, derby detection, new rule book; only the centre-hung stack shows the marquee, other big screens show six other fixtures.**
- Liverpool vs Manchester United is clearly the biggest game of the period, but it is not shown.
- The user does NOT want it put there by hand, and does NOT want the agent told about this match
  (that would be cheating). The agent has to judge "biggest match" itself, from general knowledge given
  to it some other way (e.g. a CLAUDE.md-style briefing on how to rank fixtures: club stature, rivalry,
  history, table stakes, audience), not a hint about this match.
- NOT every screen in the room should show the biggest game: spread different fixtures across screens.

## 5. Teleport / basket closes open things
**DONE: roulette seat, apps, lift panel, console and dialogs close on a server teleport or when you are picked up.**
- Being teleported or gathered into a basket must close / end whatever the player has open: the current
  roulette game, a race, any open GUI or app panel.

## 7. HUD bar (bottom right, the wallet bar)
**DONE: bar shows liquidity + your name only; click the name to sign in / switch; apps on their hotspots and M / L; help text updated.**
- None of the Rotational / Markets / Research / Sign in · Sign up buttons should be up there on the
  bar (`buildWallet` in `src/apps/shell.js`). Ask the user where they want them instead if unclear
  (e.g. reached through their rooms/hotspots and the keys M / L, sign-in from the welcome screen).

## 6. Admin console
**DONE: a "♛ Console · Alt+F2" button stays on screen while elevated; reopening never asks for the credential.**
- When someone is already logged into admin, closing the panel should not fully lock it: make it easy
  to reopen (e.g. a small "Console" button stays on screen while elevated), no password again.

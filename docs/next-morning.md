# Next morning (saved 2026-11-18, after the usage-limit reset)

The user's list, kept close to their wording. Also still open: the last three race changes (no placeholder
race, spectators to the grandstand, live odds + CLICK icon + chorded clicks) are NOT committed yet.

## 1. Boxing (VT-03)
- Boxers have no animation: add punch / guard / hit / knockdown animation (kit poses: `fight` exists).
- "Objective: walk into the ring" needs a clear indicator of where the ring is: a moving arrow on the
  ground, or an arrow sticking out of the boxer's body pointing at the ring.
- Health drains too quickly: slow it down (server `server/realtime/boxing.js` damage / cooldown).
- During a round, boxers should be dressed like boxers (kit `makeFighter` look: shorts, gloves,
  mongkol, prajioud), then back to normal after.
- Remove the placeholder people in the ring (the static fighters/referee from `combatPavilion.js`).

## 2. Horse racing (VT-04)
- Speed is too high: clicking fast finishes far too quickly. Slow the race (`speedFromTps` / track length).
- Make the leaderboard much clearer and bigger.

## 3. Teleports
- When someone is teleported, make it clear to them that they are being teleported (their screen
  freezes while the floor loads): a visible "Teleporting…" overlay.

## 4. Football room (VT-02)
- Liverpool vs Manchester United is clearly the biggest game of the period, but it is not shown.
- The user does NOT want it put there by hand, and does NOT want the agent told about this match
  (that would be cheating). The agent has to judge "biggest match" itself, from general knowledge given
  to it some other way (e.g. a CLAUDE.md-style briefing on how to rank fixtures: club stature, rivalry,
  history, table stakes, audience), not a hint about this match.
- NOT every screen in the room should show the biggest game: spread different fixtures across screens.

## 5. Teleport / basket closes open things
- Being teleported or gathered into a basket must close / end whatever the player has open: the current
  roulette game, a race, any open GUI or app panel.

## 7. HUD bar (bottom right, the wallet bar)
- None of the Rotational / Markets / Research / Sign in · Sign up buttons should be up there on the
  bar (`buildWallet` in `src/apps/shell.js`). Ask the user where they want them instead if unclear
  (e.g. reached through their rooms/hotspots and the keys M / L, sign-in from the welcome screen).

## 6. Admin console
- When someone is already logged into admin, closing the panel should not fully lock it: make it easy
  to reopen (e.g. a small "Console" button stays on screen while elevated), no password again.

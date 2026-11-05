---
name: voice-and-satire
description: The firm's voice — euphemism glossary, banned words for all UI and signage, Gen-Z background-staff dialogue targets, and signage/UI/PA tone examples (loud finance-excess satire delivered with a straight corporate face). Use whenever writing any player-visible text — signs, labels, buttons, errors, announcements, NPC dialogue, dialogue-generator prompts, agent report templates — and when reviewing copy.
---

# Voice and Satire

**Tone:** LOUD satire of finance excess (Wolf of Wall Street energy) delivered with a completely
straight corporate face. The firm never admits what anything is. Signage is serene, expensive and
euphemistic; the staff are chaotic Gen-Z; the contrast is the joke.

The firm's name is still `[FIRM NAME]` — use the `{FIRM_NAME}` placeholder in copy until the user
picks one.

## 1. Banned words (all UI, signage, chat system messages, NPC lines, generated text)

Hard-banned: **casino, gambling, gamble, gambler, gaming (in the betting sense), bet slip,
bookie, jackpot, slot machine, loan shark, addiction, rigged.**

Avoid in UI (use the glossary instead): bet, wager, win, lose, odds (prefer "pricing"), chips,
house edge, fired, alarm, money (prefer "liquidity"/"capital").

Code identifiers and internal docs may use plain words. Add an automated check: a script/test that
scans all player-facing string files and generated dialogue pools for the hard-banned list
(case-insensitive, word-boundary) and fails the build; generated lines that hit it are discarded.

**One exception for clarity and the hard rules:** the fake-money notice must be plain:
"All balances are notional. No real currency is accepted, held or paid out." Never euphemise that.

## 2. Euphemism glossary

| Real thing | Firm's term |
| --- | --- |
| Visitors' Tower | Wellness Tower |
| Casino floor | Executive Leisure Suite |
| Casino Operations dept | Leisure Operations |
| Poker room | Private Card Salon / Strategic Negotiation Salon |
| Slot machines | Automated Yield Terminals |
| Roulette | Rotational Variance Instrument |
| Blackjack | Twenty-One Advisory Table |
| Baccarat | Private Banking Table |
| Craps | Kinetic Probability Pit |
| Football arena | Sports Analytics Arena / Sports Analytics Lounge |
| Muay Thai arena | Combat Sports Analytics Pavilion |
| Horse racing | Equine Performance Centre |
| Thai lottery room | Probability Research Institute |
| Thai Betting Desk | Thai Markets Desk |
| Bet / wager | Position, allocation |
| Place a bet | Open a position |
| Odds | Pricing |
| Bet won | Realised gain |
| Bet lost | Strategic contribution (to the Treasury Reserve) |
| House edge | Institutional advantage |
| Chips | Liquidity tokens |
| Jackpot | Exceptional yield event |
| Lottery ticket | Draw participation certificate |
| Broke | Liquidity-constrained |
| Top-up | Capital injection |
| Balance reset | Portfolio rebalancing |
| Vault | Treasury Reserve |
| Cash robot | Autonomous Liquidity Courier (ALC) |
| Security guards | Asset Protection |
| Budget blowout alarm | Fiscal Discipline Advisory |
| Roll call | Mandatory Alignment Session |
| Firing | Rightsizing / "transitioning to new opportunities" |
| Escorted out | Accompanied offboarding |
| Replacement hires | Talent pipeline activation |
| Clearance for visitors | Link Access Credential |
| Glass bridge | The Link |
| Body scanners | Wellness screening |
| Lost and found (watches) | Recovered Assets Display |
| Charity wall | Community Impact Wall |
| Cigar lounge | Private Members' Lounge |

## 3. Signage and UI tone

Signage (calm, gold-lettered, slightly too proud):
- "EXECUTIVE LEISURE SUITE — Responsible Recreation Since Q3"
- "PROBABILITY RESEARCH INSTITUTE — Rigour. Precision. Fortnightly."
- "THE LINK — Authorised Synergy Only"
- "TREASURY RESERVE — Your contributions at work"
- "HUMAN CAPITAL — Every exit is an entrance somewhere else"
- "COMMUNITY IMPACT WALL — Giving back (tax-efficiently)"

UI copy (straight face, never winks):
- Open position button: **"Open Position"**; confirm: "Allocate 500 to Arsenal (1.85)?"
- Gain toast: "Realised gain: +925. Exceptional judgement."
- Loss toast: "Strategic contribution recorded: 500. The Treasury thanks you."
- Zero balance: "You are currently liquidity-constrained. A member of the Executive team may
  authorise a capital injection."
- Access denied at bridge: "Your Link Access Credential is pending. Please enjoy the Wellness Tower."
- Locked elevator button: "This floor is reserved for value creators."
- Stale data: "Pricing under review. Markets will reopen shortly."

PA announcements:
- Blowout: "Attention all associates. A Fiscal Discipline Advisory is in effect for the Sports
  Desk. Please remain calm and continue generating value."
- Rehires: "Please welcome our newest talent. Lanyards are on the left."

## 4. Background staff dialogue — Gen-Z target

Short (≤ 20 words), lowercase-leaning, internet slang, specific to real numbers via slots
(`{ticker}`, `{pct}`, `{team}`, `{score}`, `{dept}`, `{amount}`). Never cruel about real people;
mock the firm, the markets and themselves. No hard-banned words even in slang.

Own-department lines:
1. "{ticker} down {pct} and the desk is acting normal. it's giving margin call. we are not okay."
2. "bro said 'buy the dip' four dips ago. we live in the dip now."
3. "the risk officer looked at our book and just whispered 'no' and left."
4. "not me refreshing the {team} line every 3 seconds like it owes me rent."
5. "the quants built a model for the lottery. it's literally just vibes in a jacket."
6. "{team} {score}?? the sports desk is in shambles, no cap."
7. "my KPI is 'aura'. i'm exceeding expectations."
8. "if the ALC comes up here with less than {amount} i'm filing a vibe complaint."
9. "the bell rang and i screamed 'SELL' and i don't even have a ticker."
10. "low-key the Private Banking Table has better retention than our app."
11. "we're not losing, we're making strategic contributions. HR told me to say that."
12. "fighter in the red corner has main character energy. our model agrees. the model is me."
13. "the horses don't know they're a revenue stream and honestly that's the dream."
14. "ok but who approved a gold chandelier in the server room. iconic. but who."

Gossip about other departments:
15. "heard the Thai desk's model said 'trust me bro' in the footnotes."
16. "the trading floor is down {pct} today, they're manifesting a rebound. so real."
17. "Leisure Ops hit target again. the Treasury Reserve is eating good."
18. "sports desk got a Fiscal Discipline Advisory. pour one out for Kyle's lanyard."
19. "security HQ walked past with three boxes. someone got accompanied-offboarded fr."
20. "CFO's speech had a powerpoint. there were transitions. it was violent."

Generator instructions (paste into the dialogue-pool prompt): match this register; ground each line
in the provided summary facts; mix 2:1 own-department vs gossip; vary openers (no two lines start
with the same word); include slots where numbers appear; never invent real-world facts not in the
summary; never use the banned list.

## 5. Agent report voice (Executive Floor dashboards)

Key agents write like a polished, deluded investment bank memo: "Q-to-date the Sports Desk delivered
a disciplined −4.2 % on deployed capital, reflecting strategic exposure to Everton. Conviction
remains high." Numbers must be the real ledger/position numbers passed in the state.

# Token Radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/bedu45/token-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/bedu45/token-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar for [make.fun](https://make.fun/bounty/token-radar-01): it reads a sealed
DefiLlama snapshot, finds the protocols that still record no token and are not a wrapped, staked
or bridged product, ranks them by what their launch would be worth, and hands in a web dashboard
with the board, a detail view for every protocol and the steps to farm it.

## Model (radar-3)

Implied value follows only from the snapshot's own figures. No protocol name is special-cased
and no price is hardcoded: the multiples are fitted from the snapshot's own tokened peers at
runtime, and the dashboard recomputes every row from the same figures.

```
implied = round( tvl_usd x multiple x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
                 x (0.6 + min(age_days, 1095) / 1095 x 0.4) )
```

- **Multiple.** The median mcap/TVL of the tokened peers in the same category, shrunk toward
  the global median with a prior of 5 and capped at twice the global median; a category with no
  peer uses the global median. Shrinkage is a coherence change, not an accuracy claim — it
  removes the cliff where half the board shared one fallback number.
- **Range.** The same peers' p25–p75 ratios give a range for every row. The point value is the
  median-based ranking number; the range is the honest statement of what the multiple is worth.
- **Growth.** Seven-day TVL change, clamped and weighted by 0.5. A missing change is neutral.
- **Maturity.** Age with no token, from the first day DefiLlama tracked the protocol. An unknown
  age uses the snapshot median.
- **Token odds.** The category launch rate (smoothed toward the global rate) blended with the age
  band's launch rate. Odds decide the farm verdict (Farm now / Watch / Skip); they never multiply
  the value. The odds are a frequency claim, checked held-out (see the calibration table on the
  dashboard).
- **Held-out check, two blind tests.** Multiples fitted on half the tokened peers, tested on the
  other half — split by slug order and by odd/even slug order. Every term (multiple, growth,
  maturity) is kept or dropped on the two blind tests; the dashboard prints the ablation table.
  The multiple sets the level for ranking; it is not a price prediction.
- **Farm plans.** Sized to the minimum viable capital for the protocol's category and TVL band,
  with a risk note and a cost summary in $/hour of attention. The steps vary by category instead
  of one generic set.

## Board

198 rows: all 40 watchlist protocols plus every pre-token protocol that passes the same
exclusion rule, at any TVL — including 20 above the $50M floor the watchlist itself admits.
24 live-token protocols are set aside with their market caps shown. The dashboard accounts for
all 758 protocols in the snapshot: ranked, live shown, tokened set aside, and excluded by reason.
Two runs on the same snapshot produce byte-identical output: no clock, no randomness, no network.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` (Node 22, standard library only) writes `board.json`, `data.js`, `dashboard/`,
`screenshots/` and `dossier.json` to the output directory.

---

<sub>Entered on [make.fun](https://make.fun/?ref=wf9x9y4s&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

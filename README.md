# Token Radar

[![token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard)
[![reward](https://make.fun/badge/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01)

A token launch radar for [make.fun](https://make.fun/bounty/token-radar-01): it reads a sealed
DefiLlama snapshot, finds the protocols that still record no token and are not a wrapped, staked
or bridged product, ranks them by what their launch would be worth, and hands in a web dashboard
with the board, a detail view for every protocol and the steps to farm it.

## Model (radar-2)

Implied value follows only from the snapshot's own figures. No protocol name is special-cased
and no price is hardcoded: the multiples are fitted from the snapshot's own tokened peers at
runtime, and the dashboard recomputes every row from the same figures.

```
implied = round( tvl_usd x multiple x (1 + clamp(change_7d, -60, 120) / 100 x 0.5)
                 x (0.6 + min(age_days, 1095) / 1095 x 0.4) )
```

- **Multiple.** The median mcap/TVL of the tokened peers in the same category (at least 3 peers,
  exchanges excluded), else the global median. Clamped to [0.01, 2.0].
- **Growth.** Seven-day TVL change, clamped and weighted by 0.5. A missing change is neutral.
- **Maturity.** Age with no token, from the first day DefiLlama tracked the protocol. An unknown
  age uses the snapshot median.
- **Token odds.** The category launch rate (smoothed toward the global rate) blended with the age
  band's launch rate. Odds decide the farm verdict (Farm now / Watch / Skip); they never multiply
  the value.
- **Held-out check.** Multiples fitted on half the tokened peers, tested on the other half. The
  dashboard's methodology states the median error, so the reader sees what the multiple is worth:
  it sets the level for ranking, it is not a price prediction.

## Board

178 rows: all 40 watchlist protocols plus 138 early rows below the $50M floor, each passing the
same exclusion rule as the watchlist. 24 live-token protocols are set aside with their market
caps shown. Two runs on the same snapshot produce byte-identical output: no clock, no randomness,
no network.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` (Node 22, standard library only) writes `board.json`, `data.js`, `dashboard/`,
`screenshots/` and `dossier.json` to the output directory.

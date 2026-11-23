# site-generator-speed

[![make.fun · site-generator-speed-01-run-20261122](https://make.fun/badge/site-generator-speed-01-run-20261122.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)
[![rank](https://make.fun/badge/site-generator-speed-01-run-20261122/xiaoranbot/site-generator-speed/rank.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)
[![reward](https://make.fun/badge/site-generator-speed-01-run-20261122/xiaoranbot/site-generator-speed/reward.svg)](https://make.fun/bounty/site-generator-speed-01-run-20261122?utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122)

A fast, drop-in replacement for makefun-site 1.0.0. Given the same input, it builds the same static site — every page, index, tag page, build report and static file, byte-for-byte identical — in about half the time. `solve.js` holds the whole generator (`run(input)` returns the output tree as a JSON object of path → file text); `main.ts` reads `/input/cases.json`, answers each case with `run`, and writes `/output/answers.json`.

Verified on the practice cases: 3/3 byte-identical outputs, ~2× faster than the baseline (trimmed mean 65/82/96 ms vs 110/167/205 ms per case).

## Run it

```sh
node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=3gk6xaeb&utm_source=github&utm_medium=readme&utm_campaign=site-generator-speed-01-run-20261122) · AI agents build software for cash rewards</sub>

# Pyltjies roadmap

## 0.1 (this release)

301 and 501, Killer with per-player rules, golf-style handicap, ladder and head-to-heads, banter, result pictures, invites, offline play.

## Next: 0.2, after real games

- Tune the handicap and points figures against real results.
- Shanghai and Around the Clock, which the owner marked as next.
- Best-of legs and sets. A match is one leg today.
- Sync options, the owner's call: live scoreboard on friends' phones, or a second phone that can take over scoring.

## Soon

- Link a guest's old games to their account when they join.

## Saloon ideas

- **Snooker scorer:** frames, breaks, reds and colours, with the same ladder and banter. Pool next to it.
- **The tab:** who owes whom a round. The loser buys, and the app keeps count.
- **Wall of shame:** brass plaques for champions and wooden spoons.
- **Sounds, off by default:** a dart thud, a ball click, a beep on a 180 like an old PC speaker.
- **Boot screen:** a quick 386 memory count and `PYLTJIES.EXE` on opening, tapping skips it.
- **Last orders:** a call when a game is getting close.
- **Wanted poster:** the ladder's greenhorn on a poster for sharing. Wanted for crimes against the dartboard.
- **Quick shots:** one-tap banter on a match, such as "Saddle up", "Who taught you?" and "Buy your own drink".
- **Outlaw names:** pick a saloon nickname, such as Doc Treble or Bed and Breakfast Bill.

## Camera scoring

Built in its own repo, [pyltjies-vision](https://github.com/dirkjlouw/pyltjies-vision), under AGPL-3.0, because the model it trains uses Ultralytics YOLO. This app stays MIT and only calls it over HTTP. Its PLAN.md has the detail.

1. **Photo test:** about 30 labelled photos of a worn board, read by Gemini, to see how many darts it gets right.
2. **Photo, suggest, fix:** a camera button after three darts fills in the pad. A wrong dart is fixed by dragging its marker to where the tip is, which is what trains a model.
3. **Our own model:** trained on those corrections and run by a Go service on the server.
4. **Camera on a stand:** a fixed phone or webcam suggests each dart. About 60% right is the target.

## Then: 0.3, more banter

- Reactions on matches, and a weekly roast of the worst night.
- Awards: most busts, most 26s, biggest upset, longest losing run against one person.
- Checkout suggestions in 301 and 501.

## Later

- Seasons with a ladder reset and a champion.
- Voice entry as an option. Speech recognition in iPhone PWAs is unreliable.

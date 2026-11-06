# Pyltjies spec

The decisions below are the owner's, from 2026-11-06, unless marked as our own starting point.

## People and privacy

The code is open source, and each group runs its own copy. One server is one private league. The owner signs in first and anyone in the league can invite a friend. Invite links work for one person and last 7 days. Sign-in is a 6-digit emailed code. League routes return names only, never email addresses. Results leave only when someone shares a result picture or text.

Everyone can see who is in the league and when they joined, with a New tag for the first 7 days. Only the owner sees when each person was last around.

You stay signed in for up to 400 days on each browser. On an iPhone, the home screen app and Safari keep separate sign-ins, so you sign in once in each. Games and results are the same in both once saved. A game still in play lives only where it was started.

Guests are name-only players. They appear in the match log and stay off the ladder and ratings.

## Entering darts

- **Dart by dart:** Single, Double or Treble, then a number, or Outer bull, Inner bull, Miss.
- **Three-dart total (301 and 501):** type one number. The app asks only what matters: whether it started with a double, whether the last dart was a double, and how many darts the finish took. Totals three darts can't make are refused.
- **Killer pad:** only numbers that can count. 1 to 9 appear only when they count for that player and Double or Treble is selected.
- Every game has undo, including the winning dart before it's saved.

## 301 and 501

Each player has their own double in and double out. The inner bull is a double (50) and the outer bull a single (25).

- **Double in:** nothing counts until a double, which itself scores.
- **Bust:** below zero, or with double out exactly 1 left or a finish not on a double. The visit's points and opening are taken back and the turn passes.
- A head start lowers that player's starting score, up to 60% of the start (our own limit).

## Killer

The game on the owner's scoreboard. It isn't the lives-based game of the same name on websites. Two sides, rows 20 down to 10, then D, T and B.

- Three marks open a row for a side. Further hits score until the other side also has three. Then the row is dead and scores nothing.
- **A double or treble of a live 10 to 20 is the thrower's choice,** and the app shows what each option would do:
  - *On its own row:* it multiplies. T18 is three marks. Spare marks score that number each, unless the other side has the row closed too. With one mark already, T18 fills two and the third scores 18. With the row full, T18 scores 54.
  - *On D or T:* one mark there. With that row full, it scores the dart's real value, so T18 scores 54.
  - If D or T is dead, the only option is its own row.
- Bull: outer one mark, inner two, each spare mark scores 25.
- Once D or T is open, further hits score the dart's real value (D16 is 32) until the row is dead.
- **Toggles, agreed before each game, per player:**
  - *1 to 9 count on D and T:* a double or treble of 1 to 9 is one mark there.
  - *Dead numbers count on D and T:* a double or treble of a dead number is one mark there.
- **Both toggles off:** only doubles and trebles of live numbers can fill D and T.
- **Winning:** a side wins as soon as every row is open and it's level or ahead (our own default, the owner skipped this question). Anyone can end the game early, and the higher score wins. Level is a draw.

## Handicap

Darts leagues have no single standard, so this is a house system.

- **Rating:** the best 8 of your last 20 games under exactly the same rules. It needs 3 games (our own minimum). Each player is rated under the rules they played.
- **301 and 501:** three-dart average. The gap to the best player x 6.67 is the head start. That's one published method, points-per-dart gap x 20.
- **Killer:** marks per round, counting marks made and scoring extras. The gap x 50, in fives, is points on the board (our own figure, limit 300).
- Head starts are only a suggestion. Players can change them before the game. It's suggested only if everyone has a rating under their rules, so guests and new players agree one by hand.

## League points

A win scores more under harder rules, using the winner's own rules. All are our own starting figures.

| Game | Points for a win |
|---|---|
| 301 | 2, plus 1 for double in, plus 1 for double out |
| 501 | 3, plus 1 for double in, plus 1 for double out |
| Killer | 3 with both toggles on, 4 with one, 5 with neither |

## Banter

Every match gets one cheeky line, always the same for that match, and picks up 180s, three in a bed, a 26 and repeated busts. Anyone in the league can comment on a match. Share gives a square picture for WhatsApp, falling back to text.

## Look

An old saloon with a 386 behind the bar. The header and menu are a DOS screen, using the device's monospace font, with no downloaded fonts. The page is snooker baize with mahogany frames, brass for selected buttons, ivory cards and chalk slates for scores. League positions are snooker balls, black first, then pink, blue, brown, green, yellow and red for everyone below that. The cursor stops blinking if the phone asks for reduced motion.

Ladder ranks run Sheriff, Deputy, Gunslinger, Card sharp, Cowhand, Stable hand, and whoever is last is the Greenhorn. Banter lines borrow from the saloon and the snooker table, but stay about the darts.

## Keeping results honest

The phone sends only the setup and the darts. The server replays them through the same `app/games.js` and works out the scores itself. Unfinished or impossible games are refused. Anyone who played in or logged a game, or the owner, can void it. A voided game stays in the database and stops counting.

## Sync and offline

- **In play:** the game lives on the scoring phone and survives closing the app, with no connection needed. Other phones don't see it until it's saved.
- **After a game:** it goes to an outbox and is sent as soon as there's signal. Sending twice counts once.
- **Reading:** each phone keeps its last copy of the league, and refreshes on opening and on changing tabs.
- **App updates:** a new release reloads an open app by itself.

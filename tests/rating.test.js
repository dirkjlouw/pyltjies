import assert from 'node:assert/strict';
import { test } from 'node:test';
import { banterLine, ladderRank, scoreLine, shareText } from '../app/banter.js';
import { buildLeague, formatKey, formatName, matchName, maxHead, ratingFrom, suggestHeads, winPoints } from '../app/rating.js';

// A match config with the same rules for both players, plus those rules for the single-format helpers.
const x01Rules = (doubleIn = false, doubleOut = true) => ({ doubleIn, doubleOut });
const x01 = (start = 501, doubleIn = false, doubleOut = true) => ({ game: 'x01', start, sides: [{ rules: x01Rules(doubleIn, doubleOut) }, { rules: x01Rules(doubleIn, doubleOut) }] });
const killer = (countLow = true, countDead = true) => ({ game: 'killer', sides: [{ rules: { countLow, countDead } }, { rules: { countLow, countDead } }] });
const key = (config) => formatKey(config, config.sides[0].rules);
const name = (config) => formatName(config, config.sides[0].rules);
const points = (config) => winPoints(config, config.sides[0].rules);

test('each combination of toggles is its own format', () => {
  const keys = new Set([
    x01(301, false, false), x01(301, true, false), x01(301, false, true), x01(301, true, true),
    x01(501, false, false), x01(501, true, true),
    killer(true, true), killer(true, false), killer(false, true), killer(false, false),
  ].map(key));
  assert.equal(keys.size, 10);
  assert.equal(name(x01(501, false, true)), '501, straight in, double out');
  assert.equal(name(killer(false, false)), 'Killer, live doubles only');
});

test('harder settings are worth more league points', () => {
  assert.equal(points(x01(301, false, false)), 2);
  assert.equal(points(x01(501, false, false)), 3);
  assert.equal(points(x01(501, true, true)), 5);
  assert.equal(points(killer(true, true)), 3);
  assert.equal(points(killer(false, true)), 4);
  assert.equal(points(killer(false, false)), 5);
});

test('a match with different rules per player says so', () => {
  const mixed = { game: 'killer', sides: [{ rules: { countLow: true } }, { rules: {} }] };
  assert.equal(matchName(mixed), 'Killer, different rules per player');
  assert.equal(matchName(killer(true, true)), 'Killer, 1 to 9 and dead numbers count');
});

test('rating is the best 8 of the last 20, and needs 3 games', () => {
  assert.equal(ratingFrom([50, 60]), null);
  assert.equal(ratingFrom([40, 50, 60]), 50);
  const newestFirst = [...Array(8).fill(30), ...Array(12).fill(10), ...Array(10).fill(90)];
  assert.equal(ratingFrom(newestFirst), 30, 'games older than the last 20 are ignored');
  assert.equal(ratingFrom([...Array(8).fill(40), ...Array(12).fill(10)]), 40, 'bad nights are dropped');
});

test('head start: the example of a 12 point average gap gives 80 points', () => {
  assert.deepEqual(suggestHeads(x01(), [52, 40]), [0, 80]);
});

test('head start in Killer comes from marks per round in fives', () => {
  assert.deepEqual(suggestHeads(killer(), [2.4, 1.6]), [0, 40]);
});

test('no head start unless everyone has a rating, and it has a ceiling', () => {
  assert.equal(suggestHeads(x01(), [52, null]), null);
  assert.equal(suggestHeads(x01(), [52, undefined]), null);
  assert.deepEqual(suggestHeads(x01(301), [100, 10]), [0, maxHead(x01(301))]);
  assert.equal(maxHead(x01(501)), 300);
});

const match = (id, config, sides) => ({ id, config, sides });
const side = (userId, name, stat, won, extra = {}) => ({ userId, name, stat, won, remaining: won ? 0 : 100, score: 0, busts: 0, ...extra });
const members = [{ id: 'a', name: 'Dirk' }, { id: 'b', name: 'Sam' }];

test('the ladder adds points by difficulty, and keeps head-to-heads and ratings', () => {
  const matches = [
    match('1', x01(501, true, true), [side('a', 'Dirk', 50, true), side('b', 'Sam', 40, false)]),
    match('2', x01(301, false, false), [side('a', 'Dirk', 40, false), side('b', 'Sam', 45, true)]),
    match('3', x01(501, true, true), [side('a', 'Dirk', 60, true), side('b', 'Sam', 42, false)]),
    match('4', x01(501, true, true), [side('a', 'Dirk', 55, true), side('b', 'Sam', 41, false)]),
  ];
  const { ladder, formats } = buildLeague(matches, members);
  assert.equal(ladder[0].name, 'Dirk');
  assert.equal(ladder[0].points, 15);
  assert.equal(ladder[0].wins, 3);
  assert.equal(ladder[0].losses, 1);
  assert.equal(ladder[1].points, 2);
  assert.deepEqual(ladder[0].rivals.b, { wins: 3, losses: 1, draws: 0 });
  assert.equal(ladder[0].ratings['501-di-do'], 55);
  assert.equal(ladder[0].ratings['301'], null);
  assert.equal(formats['501-di-do'], '501, double in, double out');
});

test('guests are in the match but not on the ladder', () => {
  const { ladder } = buildLeague([match('1', x01(), [side('a', 'Dirk', 50, true), side(null, 'Guest', 30, false)])], members);
  assert.equal(ladder.length, 2);
  assert.equal(ladder[0].wins, 1);
  assert.deepEqual(ladder[0].rivals, {});
});

test('a draw counts as a draw for both', () => {
  const { ladder } = buildLeague([match('1', killer(), [side('a', 'Dirk', 2, false), side('b', 'Sam', 2, false)])], members);
  assert.equal(ladder[0].draws, 1);
  assert.equal(ladder[0].points, 0);
  assert.deepEqual(ladder[0].rivals.b, { wins: 0, losses: 0, draws: 1 });
});

test('one match rates each player under their own rules', () => {
  const config = { game: 'x01', start: 301, sides: [{ rules: { doubleOut: true } }, { rules: {} }] };
  const { ladder } = buildLeague([match('1', config, [side('a', 'Dirk', 50, true), side('b', 'Sam', 40, false)])], members);
  assert.equal(ladder[0].points, 3);
  const dirk = ladder.find((player) => player.id === 'a');
  const sam = ladder.find((player) => player.id === 'b');
  assert.deepEqual(Object.keys(dirk.ratings), ['301-do']);
  assert.deepEqual(Object.keys(sam.ratings), ['301']);
});

test('banter names the players and is the same every time for one match', () => {
  const played = match('abc', x01(), [side('a', 'Dirk', 50, true), side('b', 'Sam', 40, false, { remaining: 100 })]);
  assert.equal(banterLine(played), banterLine(played));
  assert.match(banterLine(played), /Dirk|Sam/);
  assert.equal(scoreLine(played), 'Dirk 0 left, Sam 100 left');
  assert.match(shareText(played, 'Five oh one'), /Five oh one: Dirk 0 left/);
  assert.match(shareText(played, 'x'), /Pyltjies, for tossers$/);
});

test('banter picks up the big moments', () => {
  const base = (extra) => match('1', x01(), [side('a', 'Dirk', 50, true, extra), side('b', 'Sam', 40, false)]);
  assert.match(banterLine(base({ maxes: 1 })), /Dirk hit a maximum/);
  assert.match(banterLine(base({ bedAndBreakfast: 1 })), /bed and breakfast/);
  assert.match(banterLine(base({ beds: 1 })), /Three in a bed for Dirk/);
  assert.match(banterLine(match('1', x01(), [side('a', 'Dirk', 50, true), side('b', 'Sam', 40, false, { busts: 4 })])), /Sam bust 4 times/);
  assert.match(banterLine(match('1', killer(), [side('a', 'Dirk', 2, false), side('b', 'Sam', 2, false)])), /drew/);
});

test('every banter line fills in the names, across many matches', () => {
  for (let i = 0; i < 300; i++) {
    const remaining = [100, 10, 400][i % 3];
    const line = banterLine(match(`m${i}`, x01(), [side('a', 'Dirk', 50, true), side('b', 'Sam', 40, false, { remaining })]));
    assert.doesNotMatch(line, /[{}]/);
    assert.match(line, /Dirk|Sam/);
  }
});

test('ladder ranks start at sheriff, and last place is always the greenhorn', () => {
  assert.equal(ladderRank(0, 5), 'Sheriff');
  assert.equal(ladderRank(1, 5), 'Deputy');
  assert.equal(ladderRank(4, 5), 'Greenhorn');
  assert.equal(ladderRank(1, 2), 'Greenhorn');
  assert.equal(ladderRank(0, 1), 'Sheriff');
  assert.equal(ladderRank(8, 12), 'Stable hand');
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dartLabel, killerChoice, killerOptions, possibleTotal, replay, rowDead, summarize } from '../app/games.js';

const sides = (a = {}, b = {}) => [{ name: 'A', ...a }, { name: 'B', ...b }];
const dart = (n, m = 1) => ({ t: 'dart', n, m });
const miss = dart(0);
// Rules given at the top go to both players unless a side has its own.
const x01 = ({ doubleIn = false, doubleOut = false, start = 301, sides: list = sides() } = {}) => ({
  game: 'x01', start, sides: list.map((side) => ({ rules: { doubleIn, doubleOut }, ...side })),
});
const killer = ({ countLow = false, countDead = false, sides: list = sides() } = {}) => ({
  game: 'killer', sides: list.map((side) => ({ rules: { countLow, countDead }, ...side })),
});
// B throws three misses so A can carry on.
const passB = [miss, miss, miss];

test('301 subtracts, and the turn moves after three darts', () => {
  const state = replay(x01(), [dart(20, 3), dart(20), dart(5)]);
  assert.equal(state.sides[0].remaining, 216);
  assert.equal(state.sides[0].darts, 3);
  assert.equal(state.turn, 1);
});

test('a treble can only be on 1 to 20, and a bull only single or inner', () => {
  assert.throws(() => replay(x01(), [dart(25, 3)]));
  assert.throws(() => replay(x01(), [dart(21)]));
  assert.throws(() => replay(x01(), [dart(0, 2)]));
  assert.equal(replay(x01(), [dart(25, 2)]).sides[0].remaining, 251);
  assert.equal(replay(x01(), [dart(25)]).sides[0].remaining, 276);
});

test('going below zero busts, restores the visit and moves on', () => {
  const state = replay(x01({ sides: sides({ head: 251 }) }), [dart(20), dart(20), dart(20)]);
  assert.equal(state.sides[0].remaining, 50);
  assert.equal(state.sides[0].busts, 1);
  assert.equal(state.sides[0].points, 0);
  assert.equal(state.turn, 1);
});

test('double out: finishing on a single busts, leaving 1 busts, a double wins', () => {
  const config = x01({ doubleOut: true, sides: sides({ head: 281 }) }); // 20 left
  assert.equal(replay(config, [dart(20)]).sides[0].busts, 1);
  assert.equal(replay(config, [dart(19)]).sides[0].busts, 1);
  const won = replay(config, [dart(10, 2)]);
  assert.equal(won.finished, true);
  assert.equal(won.winner, 0);
  const bull = replay(x01({ doubleOut: true, sides: sides({ head: 251 }) }), [dart(25, 2)]);
  assert.equal(bull.winner, 0, 'the inner bull counts as a double');
});

test('double in: nothing counts until a double, and the double itself scores', () => {
  const config = x01({ doubleIn: true });
  const state = replay(config, [dart(20, 3), dart(20), dart(10, 2)]);
  assert.equal(state.sides[0].remaining, 281);
  assert.equal(state.sides[0].opened, true);
  assert.equal(state.sides[0].points, 20);
  const notOpen = replay(config, [dart(20, 3), dart(20), dart(19)]);
  assert.equal(notOpen.sides[0].remaining, 301);
  assert.equal(notOpen.sides[0].opened, false);
});

test('a bust takes back the opening too', () => {
  const config = x01({ doubleIn: true, doubleOut: true, sides: sides({ head: 271 }) }); // 30 left
  const state = replay(config, [dart(10, 2), dart(20)]);
  assert.equal(state.sides[0].remaining, 30);
  assert.equal(state.sides[0].opened, false);
});

test('a typed total subtracts, refuses impossible numbers and can finish', () => {
  const state = replay(x01(), [{ t: 'total', total: 85 }]);
  assert.equal(state.sides[0].remaining, 216);
  assert.equal(state.sides[0].darts, 3);
  assert.equal(state.turn, 1);
  assert.throws(() => replay(x01(), [{ t: 'total', total: 179 }]));
  assert.throws(() => replay(x01(), [{ t: 'total', total: 181 }]));
  assert.equal(possibleTotal(180), true);

  const config = x01({ doubleOut: true, sides: sides({ head: 261 }) }); // 40 left
  assert.equal(replay(config, [{ t: 'total', total: 40, onDouble: false }]).sides[0].busts, 1);
  const won = replay(config, [{ t: 'total', total: 40, onDouble: true, darts: 2 }]);
  assert.equal(won.winner, 0);
  assert.equal(won.sides[0].darts, 2);
});

test('a typed total only counts in double in if they say they opened', () => {
  const config = x01({ doubleIn: true });
  assert.equal(replay(config, [{ t: 'total', total: 60, opened: false }]).sides[0].remaining, 301);
  assert.equal(replay(config, [{ t: 'total', total: 60, opened: true }]).sides[0].remaining, 241);
});

test('a head start lowers the starting score', () => {
  const state = replay(x01({ start: 501, sides: sides({}, { head: 80 }) }), []);
  assert.equal(state.sides[0].remaining, 501);
  assert.equal(state.sides[1].remaining, 421);
});

test('no darts after the game is over', () => {
  const config = x01({ sides: sides({ head: 281 }) });
  assert.throws(() => replay(config, [dart(20), dart(1)]));
});

test('average is points over darts times three', () => {
  const config = x01();
  const state = replay(config, [dart(20), dart(20), dart(20)]);
  assert.equal(summarize(config, state)[0].stat, 60);
});

test('Killer: live doubles and trebles multiply on their own row', () => {
  const state = replay(killer(), [dart(20, 3), dart(16, 2), dart(14)]);
  assert.equal(state.sides[0].marks[20], 3);
  assert.equal(state.sides[0].marks[16], 2);
  assert.equal(state.sides[0].marks[14], 1);
});

test('Killer: numbers below 10 mean nothing as singles, and the toggle decides doubles and trebles', () => {
  assert.deepEqual(replay(killer(), [dart(5)]).sides[0].marks, {});
  assert.deepEqual(replay(killer({ countLow: true }), [dart(5)]).sides[0].marks, {});
  assert.deepEqual(replay(killer(), [dart(5, 2)]).sides[0].marks, {});
  assert.equal(replay(killer({ countLow: true }), [dart(5, 2)]).sides[0].marks.D, 1);
  assert.equal(replay(killer({ countLow: true }), [dart(5, 3)]).sides[0].marks.T, 1);
  assert.deepEqual(replay(killer({ countDead: true }), [dart(5, 3)]).sides[0].marks, {});
});

test('Killer: three marks open a number, then extras score until the other side closes it', () => {
  const state = replay(killer(), [dart(20, 3), dart(20), dart(20, 2)]);
  assert.equal(state.sides[0].marks[20], 3);
  assert.equal(state.sides[0].score, 60);
  // Spare marks in the dart that opens it score too.
  const spare = replay(killer(), [dart(20, 2), dart(20, 3)]);
  assert.equal(spare.sides[0].score, 40);
  assert.equal(spare.sides[0].marks[20], 3);
});

test('Killer: once both sides have three the number is dead and scores nothing', () => {
  const events = [dart(20, 3), miss, miss, dart(20, 3), miss, miss, dart(20, 3)];
  const state = replay(killer(), events);
  assert.equal(rowDead(state, 20), true);
  assert.equal(state.sides[0].score, 0);
  assert.equal(state.last.why, 'dead');
});

test('Killer: the closing dart with spare marks does not score', () => {
  const events = [dart(20, 3), miss, miss, dart(20, 2), dart(20, 2)];
  const state = replay(killer(), events);
  assert.equal(state.sides[1].marks[20], 3);
  assert.equal(state.sides[1].score, 0);
});

test('Killer: the dead-number toggle sends doubles and trebles of dead numbers to D and T', () => {
  const dead = [dart(20, 3), miss, miss, dart(20, 3), miss, miss];
  const off = replay(killer({ countLow: true }), [...dead, dart(20, 3)]);
  assert.equal(off.sides[0].marks.T, undefined);
  const on = replay(killer({ countDead: true }), [...dead, dart(20, 3), dart(20, 2), dart(20)]);
  assert.equal(on.sides[0].marks.T, 1);
  assert.equal(on.sides[0].marks.D, 1);
  assert.equal(on.sides[0].score, 0, 'a single on a dead number is nothing');
  // A live treble never feeds T, whatever the toggle says.
  const live = replay(killer({ countDead: true, countLow: true }), [dart(19, 3)]);
  assert.equal(live.sides[0].marks.T, undefined);
  assert.equal(live.sides[0].marks[19], 3);
});

test('Killer: once D or T is open, further hits score the real value of the dart', () => {
  const config = killer({ countLow: true });
  const state = replay(config, [dart(1, 3), dart(1, 3), dart(1, 3), ...passB, dart(9, 3), dart(5, 2)]);
  assert.equal(state.sides[0].marks.T, 3);
  assert.equal(state.sides[0].score, 27);
  assert.equal(state.sides[0].marks.D, 1);
});

test('Killer: the inner bull is two marks, the outer one, and extras score 25 a mark', () => {
  const state = replay(killer(), [dart(25, 2), dart(25, 2), dart(25)]);
  assert.equal(state.sides[0].marks.B, 3);
  assert.equal(state.sides[0].score, 50);
});

test('Killer: a live double or treble can go on its own row or on D or T, whatever the toggles', () => {
  for (const config of [killer(), killer({ countLow: true, countDead: true })]) {
    const fresh = replay(config, []);
    assert.equal(killerChoice(fresh, config, { n: 20, m: 3 }), true);
    assert.equal(killerChoice(fresh, config, { n: 20, m: 2 }), true);
    assert.equal(killerChoice(fresh, config, { n: 20, m: 1 }), false, 'a single has no choice');
    assert.equal(killerChoice(fresh, config, { n: 5, m: 3 }), false, 'low numbers have no choice');
    assert.equal(killerChoice(fresh, config, { n: 25, m: 2 }), false, 'bulls have no choice');
    const placed = replay(config, [{ t: 'dart', n: 20, m: 3, to: 'bonus' }]);
    assert.equal(placed.sides[0].marks.T, 1);
    assert.equal(placed.sides[0].marks[20], undefined);
    assert.equal(replay(config, [dart(20, 3)]).sides[0].marks[20], 3);
  }
});

const asOption = ({ to, row, marks, scored }) => ({ to, row, marks, scored });

test('Killer: 18 full, a treble 18 is 54 points or one mark on T', () => {
  const config = killer();
  const state = replay(config, [dart(18, 3)]);
  assert.deepEqual(killerOptions(state, config, { n: 18, m: 3 }).map(asOption), [
    { to: 'row', row: 18, marks: 0, scored: 54 },
    { to: 'bonus', row: 'T', marks: 1, scored: 0 },
  ]);
  assert.equal(replay(config, [dart(18, 3), dart(18, 3)]).sides[0].score, 54);
  const onT = replay(config, [dart(18, 3), { t: 'dart', n: 18, m: 3, to: 'bonus' }]);
  assert.equal(onT.sides[0].score, 0);
  assert.equal(onT.sides[0].marks.T, 1);
});

test('Killer: T full and one 18, a treble 18 is two marks and 18 points, or 54 points on T', () => {
  const config = killer();
  const fillT = { t: 'dart', n: 20, m: 3, to: 'bonus' };
  const events = [fillT, fillT, fillT, ...passB, dart(18)];
  const state = replay(config, events);
  assert.deepEqual(killerOptions(state, config, { n: 18, m: 3 }).map(asOption), [
    { to: 'row', row: 18, marks: 2, scored: 18 },
    { to: 'bonus', row: 'T', marks: 0, scored: 54 },
  ]);
  const onRow = replay(config, [...events, dart(18, 3)]);
  assert.equal(onRow.sides[0].marks[18], 3);
  assert.equal(onRow.sides[0].score, 18);
  assert.equal(replay(config, [...events, { t: 'dart', n: 18, m: 3, to: 'bonus' }]).sides[0].score, 54);
});

test('Killer: if the other player has three 18s, the spare mark scores nothing', () => {
  const config = killer();
  const state = replay(config, [dart(18), miss, miss, dart(18, 3), miss, miss]);
  assert.deepEqual(killerOptions(state, config, { n: 18, m: 3 }).map(asOption)[0], { to: 'row', row: 18, marks: 2, scored: 0 });
  assert.equal(replay(config, [dart(18), miss, miss, dart(18, 3), miss, miss, dart(18, 3)]).sides[0].score, 0);
});

test('Killer: no choice on a dead number, or when D or T is dead', () => {
  const config = killer({ countDead: true });
  const dead = [dart(20, 3), miss, miss, dart(20, 3), miss, miss];
  assert.equal(killerChoice(replay(config, dead), config, { n: 20, m: 3 }), false);
  assert.throws(() => replay(config, [...dead, { t: 'dart', n: 20, m: 3, to: 'bonus' }]));
  const fillT = { t: 'dart', n: 19, m: 3, to: 'bonus' };
  const deadT = [fillT, fillT, fillT, fillT, fillT, fillT];
  assert.equal(killerChoice(replay(config, deadT), config, { n: 18, m: 3 }), false);
  assert.equal(killerChoice(replay(config, deadT), config, { n: 18, m: 2 }), true);
});

test('Killer: rules are per player, so his doubles count and mine do not', () => {
  const config = killer({ sides: sides({ rules: { countLow: false, countDead: false } }, { rules: { countLow: true, countDead: true } }) });
  const dead = [dart(20, 3), miss, miss, dart(20, 3), miss, miss];
  const state = replay(config, [...dead, dart(5, 2), dart(20, 3), miss, dart(5, 2), dart(20, 3)]);
  assert.equal(state.sides[0].marks.D, undefined, 'mine: D5 counts for nothing');
  assert.equal(state.sides[0].marks.T, undefined, 'mine: a dead T20 counts for nothing');
  assert.equal(state.sides[1].marks.D, 1, 'his: D5 counts');
  assert.equal(state.sides[1].marks.T, 1, 'his: a dead T20 counts');
});

test('301: rules are per player too, so one can finish without a double', () => {
  const config = x01({ sides: sides({ head: 281, rules: { doubleOut: true } }, { head: 281, rules: { doubleOut: false } }) });
  const state = replay(config, [dart(20)]);
  assert.equal(state.sides[0].busts, 1);
  assert.equal(replay(config, [miss, miss, miss, dart(20)]).winner, 1);
  const opening = x01({ sides: sides({ rules: { doubleIn: true } }, { rules: { doubleIn: false } }) });
  const opened = replay(opening, [dart(20), miss, miss, dart(20)]);
  assert.equal(opened.sides[0].remaining, 301);
  assert.equal(opened.sides[1].remaining, 281);
});

function openEverything() {
  const numbers = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10];
  const darts = [
    ...numbers.map((n) => dart(n, 3)), dart(25, 2), dart(25),
    dart(1, 2), dart(1, 2), dart(1, 2), dart(1, 3), dart(1, 3), dart(1, 3),
  ];
  const events = [];
  darts.forEach((item, index) => {
    events.push(item);
    if (index % 3 === 2 && index < darts.length - 1) events.push(...passB);
  });
  return events;
}

test('Killer: a side wins as soon as every row is open and it is level or ahead', () => {
  const config = killer({ countLow: true });
  const state = replay(config, openEverything());
  assert.equal(state.finished, true);
  assert.equal(state.winner, 0);
});

test('Killer: every row open but behind on points means play on', () => {
  const config = killer({ countLow: true, sides: sides({}, { head: 100 }) });
  const state = replay(config, openEverything());
  assert.equal(state.finished, false);
});

test('Killer: ending early gives it to the higher score, and level is a draw', () => {
  const ahead = replay(killer({ sides: sides({ head: 20 }) }), [{ t: 'end' }]);
  assert.equal(ahead.winner, 0);
  const level = replay(killer(), [{ t: 'end' }]);
  assert.equal(level.finished, true);
  assert.equal(level.winner, null);
});

test('Killer: marks per round counts marks made, and scoring extras', () => {
  const config = killer();
  const state = replay(config, [dart(20, 3), dart(20), dart(5)]);
  assert.equal(summarize(config, state)[0].stat, 4);
});

test('highlights are noticed: three in a bed, 26, 180, busts', () => {
  const bed = replay(x01(), [dart(20, 3), dart(20, 3), dart(20, 3)]);
  assert.equal(bed.sides[0].beds, 1);
  assert.equal(bed.sides[0].maxes, 1);
  assert.equal(bed.sides[0].tons, 1);
  assert.equal(replay(x01(), [dart(5), dart(20), dart(1)]).sides[0].bedAndBreakfast, 1);
  assert.equal(replay(killer(), [dart(20), dart(20), dart(20)]).sides[0].beds, 1);
});

test('dart labels read the way people say them', () => {
  assert.equal(dartLabel({ n: 20, m: 3 }), 'T20');
  assert.equal(dartLabel({ n: 16, m: 2 }), 'D16');
  assert.equal(dartLabel({ n: 25, m: 2 }), 'Inner bull');
  assert.equal(dartLabel({ n: 0, m: 1 }), 'Miss');
});

// The rules of 301, 501 and Killer. Pure functions, shared by the phone and the server: a game is
// its setup plus a list of events, and the state is always rebuilt by replaying them. That makes
// undo trivial and lets the server check every result it is sent.
//
// Events:  { t: 'dart', n, m }  n is 0 (miss), 1 to 20 or 25; m is 1, 2 or 3 (25 only takes 1 or 2).
//          { t: 'total', total, opened, onDouble, darts }  a whole 301/501 visit typed as one number.
//          { t: 'end' }  stop a Killer game now: the higher score wins.
// Rules belong to each player (config.sides[i].rules), so the weaker player's doubles can count and
// the stronger player's not. 301/501: { doubleIn, doubleOut }. Killer: { countLow, countDead }.

export const KILLER_NUMBERS = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10];
export const ALL_KILLER_ROWS = [...KILLER_NUMBERS, 'D', 'T', 'B'];
export const MARKS_TO_OPEN = 3;

// Three darts can't add up to these, so a typed total of one of them is a typo.
const IMPOSSIBLE_TOTALS = new Set([163, 166, 169, 172, 173, 175, 176, 178, 179]);

export const dartLabel = ({ n, m }) => {
  if (n === 0) return 'Miss';
  if (n === 25) return m === 2 ? 'Inner bull' : 'Outer bull';
  return `${['', 'S', 'D', 'T'][m]}${n}`;
};

export const possibleTotal = (total) => Number.isInteger(total) && total >= 0 && total <= 180 && !IMPOSSIBLE_TOTALS.has(total);

function checkDart({ n, m }) {
  const validNumber = Number.isInteger(n) && (n === 0 || n === 25 || (n >= 1 && n <= 20));
  const validMultiplier = m === 1 || (n !== 0 && m === 2) || (n !== 0 && n !== 25 && m === 3);
  if (!validNumber || !validMultiplier) throw new Error('Not a real dart');
}

const noteBed = (side, visit) => {
  if (visit.length !== 3) return;
  const [a, b, c] = visit;
  if (a.n !== 0 && a.n === b.n && b.n === c.n && a.m === b.m && b.m === c.m) side.beds += 1;
  const singles = visit.every((dart) => dart.m === 1);
  if (singles && [...visit].map((dart) => dart.n).sort((x, y) => x - y).join() === '1,5,20') side.bedAndBreakfast += 1;
};

// ---- 301 and 501 ----

function x01Start(config) {
  return {
    game: 'x01',
    sides: config.sides.map((side) => ({
      remaining: config.start - (side.head || 0),
      opened: !side.rules?.doubleIn,
      points: 0, darts: 0, busts: 0, tons: 0, maxes: 0, beds: 0, bedAndBreakfast: 0, highVisit: 0,
    })),
    turn: 0, visit: [], visitPoints: 0, visitFrom: null, finished: false, winner: null, last: null,
  };
}

function x01EndVisit(state, config) {
  const side = state.sides[state.turn];
  side.highVisit = Math.max(side.highVisit, state.visitPoints);
  if (state.visitPoints >= 100) side.tons += 1;
  if (state.visitPoints === 180) side.maxes += 1;
  noteBed(side, state.visit);
  state.turn = (state.turn + 1) % config.sides.length;
  state.visit = [];
  state.visitPoints = 0;
  state.visitFrom = null;
}

function x01Bust(state, config, side) {
  side.remaining = state.visitFrom.remaining;
  side.opened = state.visitFrom.opened;
  side.points -= state.visitPoints;
  side.busts += 1;
  state.visitPoints = 0;
  state.last = { bust: true };
  x01EndVisit(state, config);
}

function x01Dart(state, config, dart) {
  const side = state.sides[state.turn];
  const { doubleOut } = config.sides[state.turn].rules ?? {};
  if (!state.visitFrom) state.visitFrom = { remaining: side.remaining, opened: side.opened };
  side.darts += 1;
  state.visit.push({ n: dart.n, m: dart.m });
  state.last = { dart };
  const isDouble = dart.m === 2;
  if (!side.opened && isDouble) side.opened = true;
  const value = side.opened ? dart.n * dart.m : 0;
  const after = side.remaining - value;
  if (after < 0 || (doubleOut && after === 1) || (after === 0 && doubleOut && !isDouble)) {
    x01Bust(state, config, side);
    return;
  }
  side.remaining = after;
  side.points += value;
  state.visitPoints += value;
  if (after === 0) {
    state.finished = true;
    state.winner = state.turn;
    side.highVisit = Math.max(side.highVisit, state.visitPoints);
    if (state.visitPoints >= 100) side.tons += 1;
    return;
  }
  if (state.visit.length === 3) x01EndVisit(state, config);
}

function x01Total(state, config, event) {
  const { total } = event;
  if (!possibleTotal(total)) throw new Error('Not a possible three-dart total');
  if (state.visit.length) throw new Error('Finish the darts in this visit first');
  const side = state.sides[state.turn];
  const { doubleOut } = config.sides[state.turn].rules ?? {};
  state.visitFrom = { remaining: side.remaining, opened: side.opened };
  if (!side.opened && event.opened) side.opened = true;
  const value = side.opened ? total : 0;
  const after = side.remaining - value;
  const busted = after < 0 || (doubleOut && after === 1) || (after === 0 && doubleOut && !event.onDouble);
  const darts = after === 0 && !busted && [1, 2, 3].includes(event.darts) ? event.darts : 3;
  side.darts += darts;
  state.last = { total };
  if (busted) {
    x01Bust(state, config, side);
    return;
  }
  side.remaining = after;
  side.points += value;
  state.visitPoints = value;
  if (after === 0) {
    state.finished = true;
    state.winner = state.turn;
    side.highVisit = Math.max(side.highVisit, value);
    if (value >= 100) side.tons += 1;
    if (value === 180) side.maxes += 1;
    return;
  }
  x01EndVisit(state, config);
}

// ---- Killer ----

export const rowOpen = (side, row) => (side.marks[row] ?? 0) >= MARKS_TO_OPEN;
export const rowDead = (state, row) => state.sides.every((side) => rowOpen(side, row));

function killerStart(config) {
  return {
    game: 'killer',
    rows: ALL_KILLER_ROWS,
    sides: config.sides.map((side) => ({
      marks: {}, score: side.head || 0, head: side.head || 0, earned: 0, counted: 0, darts: 0, beds: 0, bedAndBreakfast: 0,
    })),
    turn: 0, visit: [], finished: false, winner: null, last: null,
  };
}

const bonusRow = (m) => (m === 2 ? 'D' : 'T');

/** What a number of marks on a row would do for a side right now, without changing anything. */
function markEffect(state, side, row, marks, each) {
  const added = Math.min(marks, MARKS_TO_OPEN - (side.marks[row] ?? 0));
  const spare = marks - added;
  const closedByAll = state.sides.every((other) => other === side || rowOpen(other, row));
  return { row, marks: added, spare, scored: spare > 0 && !closedByAll ? spare * each : 0 };
}

/** A double or treble of a live 10 to 20 can go on its own row or on D or T, as long as that row isn't dead. */
export function killerChoice(state, config, { n, m }) {
  if (m < 2 || n < 10 || n > 20) return false;
  return !rowDead(state, n) && !rowDead(state, bonusRow(m));
}

/** The two ways to place a dart that has a choice, with what each would do, for the buttons. */
export function killerOptions(state, config, { n, m }) {
  const side = state.sides[state.turn];
  return [
    { to: 'row', ...markEffect(state, side, n, m, n) },
    { to: 'bonus', ...markEffect(state, side, bonusRow(m), 1, n * m) },
  ];
}

/** Which row a dart belongs on right now, how many marks it brings and what each spare mark scores. */
export function killerTarget(state, config, { n, m, to }) {
  const rules = config.sides[state.turn].rules ?? {};
  if (to === 'bonus') {
    if (!killerChoice(state, config, { n, m })) throw new Error('That dart has no choice of row');
    return { row: bonusRow(m), marks: 1, each: n * m };
  }
  if (n === 0) return null;
  if (n === 25) return { row: 'B', marks: m, each: 25 };
  if (n >= 10 && !rowDead(state, n)) return { row: n, marks: m, each: n };
  if (m === 1) return null;
  if (n >= 10 ? !rules.countDead : !rules.countLow) return null;
  return { row: bonusRow(m), marks: 1, each: n * m };
}

function killerDart(state, config, dart) {
  const side = state.sides[state.turn];
  side.darts += 1;
  state.visit.push({ n: dart.n, m: dart.m });
  const target = killerTarget(state, config, dart);
  const numberDead = dart.n >= 10 && dart.n <= 20 && rowDead(state, dart.n);
  state.last = { dart, marks: 0, scored: 0, row: target?.row ?? null, why: target ? null : numberDead ? 'dead' : 'none' };
  if (target && !rowDead(state, target.row)) {
    const effect = markEffect(state, side, target.row, target.marks, target.each);
    side.marks[target.row] = (side.marks[target.row] ?? 0) + effect.marks;
    side.score += effect.scored;
    side.earned += effect.scored;
    side.counted += effect.marks + (effect.scored > 0 ? effect.spare : 0);
    state.last.marks = effect.marks;
    state.last.scored = effect.scored;
  } else if (target) {
    state.last.why = 'dead';
  }
  const others = state.sides.filter((other) => other !== side);
  if (state.rows.every((row) => rowOpen(side, row)) && others.every((other) => side.score >= other.score)) {
    state.finished = true;
    state.winner = state.turn;
    return;
  }
  if (state.visit.length === 3) {
    noteBed(side, state.visit);
    state.turn = (state.turn + 1) % config.sides.length;
    state.visit = [];
  }
}

function killerEnd(state) {
  const best = Math.max(...state.sides.map((side) => side.score));
  const leaders = state.sides.flatMap((side, index) => (side.score === best ? [index] : []));
  state.finished = true;
  state.winner = leaders.length === 1 ? leaders[0] : null;
}

// ---- Shared ----

export function replay(config, events) {
  const state = config.game === 'killer' ? killerStart(config) : x01Start(config);
  for (const event of events) {
    if (state.finished) throw new Error('The game is already over');
    if (event.t === 'dart') {
      checkDart(event);
      (config.game === 'killer' ? killerDart : x01Dart)(state, config, event);
    } else if (event.t === 'total' && config.game === 'x01') {
      x01Total(state, config, event);
    } else if (event.t === 'end' && config.game === 'killer') {
      killerEnd(state);
    } else {
      throw new Error('Not a valid event');
    }
  }
  return state;
}

/** The numbers stored for each player. `stat` drives the handicap: three-dart average or marks per round. */
export function summarize(config, state) {
  return state.sides.map((side, index) => {
    const base = { name: config.sides[index].name, userId: config.sides[index].userId ?? null, head: config.sides[index].head || 0, darts: side.darts, won: state.winner === index };
    const stat = side.darts ? Math.round(((config.game === 'killer' ? side.counted : side.points) / side.darts) * 300) / 100 : 0;
    const extras = { beds: side.beds, bedAndBreakfast: side.bedAndBreakfast };
    if (config.game === 'killer') {
      return { ...base, ...extras, stat, score: side.score, opened: state.rows.filter((row) => rowOpen(side, row)).length, rows: state.rows.length };
    }
    return { ...base, ...extras, stat, remaining: side.remaining, busts: side.busts, tons: side.tons, maxes: side.maxes, highVisit: side.highVisit };
  });
}

// The app's own cheek. Each match gets one line, always the same one for that match, and share text
// is built here too. Friendly, a bit rude, never about anything but the darts.

const WIN_LINES = [
  '{w} shafted {l}. Nothing more to say.',
  '{l} threw like a proper tosser, and {w} said thank you very much.',
  '{w} beat {l}. Someone tell {l} the pointy end goes first.',
  '{w} took that off {l}. {l} is buying the next round.',
  '{l} lost to {w}. The wall behind the board is the real casualty.',
  '{w} wins. {l} will be explaining this one for a while.',
  // The saloon
  '{w} rode into town and cleaned out {l}. Drinks are on {l}.',
  "This board ain't big enough for {w} and {l}, so {l} can saddle up.",
  '{l} drew first and still missed the board. {w} tips the hat.',
  '{w} ran {l} out of town. Mind the swinging doors on the way out.',
  '{w} is the new sheriff. {l} can polish the spittoon.',
  '{l} was snookered all night by {w}. No shot, no chalk, no excuses.',
  '{w} cleared the table while {l} looked for the chalk.',
];
const CLOSE_LINES = [
  '{w} just about got past {l}. Sweaty palms all round.',
  'Could have gone either way, but {w} got it and {l} has to hear about it.',
  'A showdown at high noon, and {w} got there a whisker before {l}.',
  'Down to the last black, and {w} potted it. Hard luck, {l}.',
];
const HEAVY_LINES = [
  '{w} absolutely flattened {l}. Somebody check on {l}.',
  '{l} never got out of the car park. {w} wins by a mile.',
  '{l} got lassoed, hog-tied and sent home by {w}.',
  "Tumbleweed rolled past {l}'s score. {w} wins by a country mile.",
  '{w} made a century break, and {l} never left the chair.',
];

// Everyone gets a rank on the ladder. Whoever is last is always the greenhorn.
const RANKS = ['Sheriff', 'Deputy', 'Gunslinger', 'Card sharp', 'Cowhand', 'Stable hand'];

export function ladderRank(index, total) {
  if (total > 1 && index === total - 1) return 'Greenhorn';
  return RANKS[Math.min(index, RANKS.length - 1)];
}

const hashOf = (text) => [...String(text)].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) % 100_003, 7);
const pick = (lines, seed) => lines[hashOf(seed) % lines.length];
const fill = (line, w, l) => line.replaceAll('{w}', w).replaceAll('{l}', l);

function names(list) {
  if (list.length < 2) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} and ${list.at(-1)}`;
}

function isClose(match) {
  const sides = match.sides;
  const winner = sides.find((side) => side.won);
  const others = sides.filter((side) => !side.won);
  if (match.config.game === 'killer') {
    const margin = winner.score - Math.max(...others.map((side) => side.score));
    return margin <= 25 ? 'close' : margin >= 150 ? 'heavy' : '';
  }
  const left = Math.min(...others.map((side) => side.remaining));
  if (left <= 40) return 'close';
  return left >= match.config.start / 2 ? 'heavy' : '';
}

/** The headline line for a finished match. */
export function banterLine(match) {
  const sides = match.sides;
  const winner = sides.find((side) => side.won);
  if (!winner) return `${names(sides.map((side) => side.name))} drew. All that effort for absolutely nothing.`;
  const winners = names(sides.filter((side) => side.won).map((side) => side.name));
  const losers = names(sides.filter((side) => !side.won).map((side) => side.name));
  const max = sides.find((side) => side.maxes > 0);
  if (max) return `${max.name} hit a maximum 180. Everyone else can go home.`;
  const bnb = sides.find((side) => side.bedAndBreakfast > 0);
  if (bnb) return `${bnb.name} checked into the bed and breakfast with a 26. Lovely stay.`;
  const bed = sides.find((side) => side.beds > 0);
  if (bed) return `Three in a bed for ${bed.name}. Tidy work, and nobody is asking questions.`;
  const buster = sides.find((side) => !side.won && side.busts >= 3);
  if (buster) return `${buster.name} bust ${buster.busts} times. Basic subtraction is available in this app, you know.`;
  const closeness = isClose(match);
  const lines = closeness === 'close' ? CLOSE_LINES : closeness === 'heavy' ? HEAVY_LINES : WIN_LINES;
  return fill(pick(lines, match.id), winners, losers);
}

/** "Dirk 0 left, Sam 61 left" or "Dirk 240, Sam 180". */
export function scoreLine(match) {
  return resultRows(match).map((row) => `${row.name} ${row.value}`).join(', ');
}

/** One row per side of the result: partners in Killer share a row. */
export function resultRows(match) {
  if (match.config.game !== 'killer') return match.sides.map((side) => ({ name: side.name, value: `${side.remaining} left`, won: side.won }));
  const teams = [...new Set(match.sides.map((side, index) => side.team ?? index))];
  return teams.map((team) => {
    const members = match.sides.filter((side, index) => (side.team ?? index) === team);
    return { name: names(members.map((side) => side.name)), value: String(members[0].score), won: members[0].won };
  });
}

export const statLabel = (match, side) => (match.config.game === 'killer'
  ? `${side.stat.toFixed(2)} marks per round`
  : `${side.stat.toFixed(1)} three-dart average`);

export function shareText(match, formatLabel) {
  return `${banterLine(match)}\n${formatLabel}: ${scoreLine(match)}\nPyltjies, for tossers`;
}

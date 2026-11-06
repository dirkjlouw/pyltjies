// The golf-style handicap and the league table. Shared by the phone and the server.
// Darts leagues have no single standard formula, so every figure here is our own starting point,
// to be tuned after real games. The 6.67 comes from one published method: points-per-dart gap x 20
// (https://www.darting.com/Darts-Blog/Darts-Blog-April-9-2009), which is three-dart-average gap x 6.67.

export const RECENT_GAMES = 20; // like golf: look at the last 20 scores...
export const BEST_GAMES = 8; // ...and average the best 8
export const MIN_GAMES = 3; // our choice: fewer than this is too little to set a head start
export const X01_POINTS_PER_AVERAGE = 20 / 3;
export const KILLER_POINTS_PER_MPR = 50; // our own figure, tune after real games
export const KILLER_MAX_HEAD = 300; // our own figure

export const maxHead = (config) => (config.game === 'killer' ? KILLER_MAX_HEAD : Math.floor(config.start * 0.6));

/** A format is the game plus the rules that player had, so each set of rules has its own rating. */
export function formatKey(config, rules = {}) {
  if (config.game === 'killer') return `killer${rules.countLow ? '-low' : ''}${rules.countDead ? '-dead' : ''}`;
  return `${config.start}${rules.doubleIn ? '-di' : ''}${rules.doubleOut ? '-do' : ''}`;
}

export function formatName(config, rules = {}) {
  if (config.game === 'killer') {
    if (rules.countLow && rules.countDead) return 'Killer, 1 to 9 and dead numbers count';
    if (rules.countLow) return 'Killer, 1 to 9 count';
    if (rules.countDead) return 'Killer, dead numbers count';
    return 'Killer, live doubles only';
  }
  const ways = [rules.doubleIn ? 'double in' : 'straight in', rules.doubleOut ? 'double out' : 'straight out'];
  return `${config.start}, ${ways.join(', ')}`;
}

/** What to call a whole match, which may have different rules per player. */
export function matchName(config) {
  const names = new Set(config.sides.map((side) => formatName(config, side.rules)));
  if (names.size === 1) return [...names][0];
  return `${config.game === 'killer' ? 'Killer' : config.start}, different rules per player`;
}

/** League points for a win under these rules, so harder rules are worth more. Our own starting figures. */
export function winPoints(config, rules = {}) {
  if (config.game === 'killer') return 5 - (rules.countLow ? 1 : 0) - (rules.countDead ? 1 : 0);
  return (config.start === 501 ? 3 : 2) + (rules.doubleIn ? 1 : 0) + (rules.doubleOut ? 1 : 0);
}

/** Best 8 of the last 20 (newest first). Null until there are enough games. */
export function ratingFrom(stats) {
  if (stats.length < MIN_GAMES) return null;
  const best = stats.slice(0, RECENT_GAMES).sort((a, b) => b - a).slice(0, BEST_GAMES);
  return Math.round((best.reduce((sum, stat) => sum + stat, 0) / best.length) * 100) / 100;
}

const round5 = (value) => Math.round(value / 5) * 5;

/**
 * Head start for each player against the strongest. Everyone needs a rating in this exact format,
 * otherwise it returns null and the players agree one by hand.
 */
export function suggestHeads(config, ratings) {
  if (!ratings.length || ratings.some((rating) => rating === null || rating === undefined)) return null;
  const best = Math.max(...ratings);
  return ratings.map((rating) => {
    const gap = best - rating;
    const head = config.game === 'killer' ? round5(gap * KILLER_POINTS_PER_MPR) : Math.round(gap * X01_POINTS_PER_AVERAGE);
    return Math.min(head, maxHead(config));
  });
}

/** Turns saved matches (newest first) into the ladder, per-format ratings and head-to-heads. */
export function buildLeague(matches, members) {
  const players = new Map(members.map((member) => [member.id, {
    id: member.id, name: member.name, points: 0, played: 0, wins: 0, losses: 0, draws: 0, stats: {}, ratings: {}, rivals: {},
  }]));
  const formats = {};
  for (const match of matches) {
    const winner = match.sides.find((side) => side.won);
    match.sides.forEach((side, index) => {
      const { rules } = match.config.sides[index];
      const key = formatKey(match.config, rules);
      formats[key] = formatName(match.config, rules);
      const player = side.userId && players.get(side.userId);
      if (!player) return;
      player.played += 1;
      (player.stats[key] ??= []).push(side.stat);
      if (side.won) {
        player.wins += 1;
        player.points += winPoints(match.config, rules);
      } else if (winner) {
        player.losses += 1;
      } else {
        player.draws += 1;
      }
      for (const other of match.sides) {
        if (other === side || !other.userId || !players.has(other.userId)) continue;
        const rival = (player.rivals[other.userId] ??= { wins: 0, losses: 0, draws: 0 });
        if (side.won) rival.wins += 1;
        else if (other.won) rival.losses += 1;
        else if (!winner) rival.draws += 1;
      }
    });
  }
  for (const player of players.values()) {
    for (const [key, stats] of Object.entries(player.stats)) player.ratings[key] = ratingFrom(stats);
    delete player.stats;
  }
  const ladder = [...players.values()].sort((a, b) => b.points - a.points || b.wins - a.wins || a.played - b.played || a.name.localeCompare(b.name));
  return { ladder, formats };
}

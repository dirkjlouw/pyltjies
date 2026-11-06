// The app's screens. A game in progress lives on this phone, so it survives a closed app or no
// signal. Finished games wait in an outbox until the server has them.
import { banterLine, ladderRank, scoreLine, shareText, statLabel } from './banter.js';
import { ALL_KILLER_ROWS, KILLER_NUMBERS, dartLabel, killerChoice, killerOptions, killerTarget, possibleTotal, replay, rowDead, rowOpen, summarize } from './games.js';
import { MIN_GAMES, formatKey, formatName, matchName, maxHead, suggestHeads } from './rating.js';
import { APP_VERSION } from './version.js';

const USER_KEY = 'pyltjies-user';
const $ = (id) => document.getElementById(id);

/** Builds elements. Text always goes in as text, so names and banter can't inject anything. */
function h(tag, attrs = {}, ...children) {
  const element = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null || value === false) continue;
    if (key.startsWith('on')) element.addEventListener(key.slice(2), value);
    else if (key === 'class') element.className = value;
    else if (key === 'value') element.value = value;
    else if (key === 'checked' || key === 'disabled') element[key] = true;
    else element.setAttribute(key, value === true ? '' : value);
  }
  element.append(...children.flat().filter((child) => child !== null && child !== undefined && child !== false));
  return element;
}

let me = null;
let store = { league: null, game: null, outbox: [], setup: null };
const ui = { view: 'play', multiplier: 1, entry: 'darts', ask: null, typed: '', placing: null, finished: null, invites: [] };
const signIn = { email: '', isNew: false, invite: new URLSearchParams(location.search).get('invite') };

const storeKey = () => `pyltjies:${me.id}`;

function readStorage(key) {
  try {
    return JSON.parse(localStorage.getItem(key));
  } catch {
    return null;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private browsing can refuse storage. The screen still works until it's closed.
  }
}

const persist = () => { if (me) writeStorage(storeKey(), store); };

async function api(method, url, body) {
  let response;
  try {
    response = await fetch(url, {
      method,
      headers: method === 'GET' ? {} : { 'Content-Type': 'application/json' },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    });
  } catch {
    throw Object.assign(new Error("You're offline. Try again when you're connected."), { offline: true });
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error || 'Something went wrong.'), { status: response.status });
  return data;
}

let toastTimer = null;
function toast(message) {
  document.querySelector('.toast')?.remove();
  const element = h('div', { class: 'toast', role: 'status' }, message);
  document.body.append(element);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.remove(), 3000);
}

// ---- League data ----

async function refreshLeague() {
  try {
    store.league = await api('GET', '/api/league');
    persist();
    return true;
  } catch (error) {
    if (error.status === 401) signOutHere();
    return false;
  }
}

/** Sends finished games. A game the server refuses is dropped, because retrying can't fix it. */
async function flushOutbox() {
  let sent = false;
  for (const match of [...store.outbox]) {
    try {
      await api('POST', '/api/matches', { id: match.id, playedAt: match.playedAt, config: match.config, events: match.events });
      store.outbox = store.outbox.filter((item) => item.id !== match.id);
      sent = true;
    } catch (error) {
      if (error.offline || error.status === 401 || error.status >= 500) break;
      store.outbox = store.outbox.filter((item) => item.id !== match.id);
      toast(error.message);
    }
    persist();
  }
  return sent;
}

async function syncAll() {
  await flushOutbox();
  await refreshLeague();
  if (me && !store.game && ui.view !== 'play') render();
}

const members = () => store.league?.members ?? [{ id: me.id, name: me.name, you: true }];
const ladderEntry = (id) => store.league?.ladder?.find((player) => player.id === id);

// ---- Setup ----

const defaultSetup = () => ({
  game: 'x01-501',
  rules: { doubleIn: false, doubleOut: true, countLow: true, countDead: true },
  perPlayer: false,
  playerRules: {},
  picks: [me.id],
  guests: [],
  heads: {},
});

const setupConfigBase = (setup) => (setup.game === 'killer' ? { game: 'killer' } : { game: 'x01', start: setup.game === 'x01-301' ? 301 : 501 });
const pickKey = (pick) => pick;

function pickName(pick) {
  return members().find((member) => member.id === pick)?.name ?? pick;
}

const isGuest = (setup, pick) => setup.guests.includes(pick);

function rulesFor(setup, pick) {
  const base = setup.perPlayer ? { ...setup.rules, ...setup.playerRules[pick] } : setup.rules;
  return setup.game === 'killer'
    ? { countLow: base.countLow, countDead: base.countDead }
    : { doubleIn: base.doubleIn, doubleOut: base.doubleOut };
}

function suggestedHeads(setup) {
  const config = setupConfigBase(setup);
  return suggestHeads(config, setup.picks.map((pick) => (isGuest(setup, pick) ? null : ladderEntry(pick)?.ratings?.[formatKey(config, rulesFor(setup, pick))] ?? null)));
}

function renderSetup() {
  const setup = store.setup;
  setup.picks = setup.picks.filter((pick) => isGuest(setup, pick) || members().some((member) => member.id === pick));
  const isKiller = setup.game === 'killer';
  const update = () => { persist(); render(); };
  const toggle = (key, title, note, holder) => h('label', { class: 'toggle' },
    h('input', { type: 'checkbox', checked: holder[key], onchange: (event) => { holder[key] = event.target.checked; update(); } }),
    h('span', {}, title, h('small', {}, note)));
  const toggles = (holder) => (isKiller
    ? [
      toggle('countLow', '1 to 9 count on D and T', 'A double or treble of 1 to 9 is a mark on D or T.', holder),
      toggle('countDead', 'Dead numbers count on D and T', 'A double or treble of a number closed by both sides is a mark on D or T.', holder),
    ]
    : [
      toggle('doubleIn', 'Open on a double', 'Nothing counts until a double. The inner bull is a double.', holder),
      toggle('doubleOut', 'Finish on a double', 'The last dart must be a double. The inner bull is a double.', holder),
    ]);

  const guestInput = h('input', { type: 'text', maxlength: 40, autocomplete: 'off' });
  const suggested = setup.picks.length >= 2 ? suggestedHeads(setup) : null;
  const config = setupConfigBase(setup);
  const limit = maxHead(config);

  return h('div', {},
    members().length < 2 ? h('section', { class: 'card', id: 'just-you' },
      h('h2', {}, 'Just you in here'),
      h('p', { class: 'muted' }, 'Invite someone to lose to you, or add them as a guest below.'),
      h('div', { class: 'actions' }, h('button', { type: 'button', class: 'primary', onclick: shareInvite }, 'Share an invite'))) : null,
    h('section', { class: 'card' },
      h('h2', {}, 'New game'),
      h('div', { class: 'segments', role: 'group', 'aria-label': 'Game' },
        [['x01-301', '301'], ['x01-501', '501'], ['killer', 'Killer']].map(([key, label]) => h('button', {
          type: 'button', 'aria-pressed': String(setup.game === key), onclick: () => { setup.game = key; setup.heads = {}; update(); },
        }, label))),
      setup.perPlayer ? null : toggles(setup.rules),
      h('label', { class: 'toggle' },
        h('input', { type: 'checkbox', checked: setup.perPlayer, onchange: (event) => { setup.perPlayer = event.target.checked; setup.heads = {}; update(); } }),
        h('span', {}, 'Different rules per player', h('small', {}, 'Give someone less competitive the easier rules. Each player is rated under their own.')))),

    h('section', { class: 'card' },
      h('h2', {}, 'Who is playing?'),
      h('p', { class: 'muted' }, isKiller ? 'Killer has two sides. Tap in throwing order.' : 'Two to four players. Tap in throwing order.'),
      h('div', { class: 'player-picks', role: 'group', 'aria-label': 'Players' },
        members().map((member) => {
          const at = setup.picks.indexOf(member.id);
          return h('button', {
            type: 'button', 'aria-pressed': String(at >= 0),
            onclick: () => { setup.picks = at >= 0 ? setup.picks.filter((pick) => pick !== member.id) : [...setup.picks, member.id]; setup.heads = {}; update(); },
          }, `${at >= 0 ? `${at + 1}. ` : ''}${member.name}`);
        }),
        setup.guests.map((guest) => {
          const at = setup.picks.indexOf(guest);
          return h('button', {
            type: 'button', 'aria-pressed': String(at >= 0),
            onclick: () => { setup.picks = at >= 0 ? setup.picks.filter((pick) => pick !== guest) : [...setup.picks, guest]; setup.heads = {}; update(); },
          }, `${at >= 0 ? `${at + 1}. ` : ''}${guest} (guest)`);
        })),
      h('form', {
        class: 'inline-form',
        onsubmit: (event) => {
          event.preventDefault();
          const name = guestInput.value.trim().slice(0, 40);
          if (!name) return;
          if (setup.guests.includes(name) || members().some((member) => member.name === name)) {
            toast('That name is already on the list');
            return;
          }
          setup.guests.push(name);
          setup.picks.push(name);
          setup.heads = {};
          update();
        },
      }, h('label', {}, 'Add a guest', guestInput), h('button', { type: 'submit' }, 'Add')),
      h('p', { class: 'muted' }, 'Guests play but stay off the ladder.')),

    setup.perPlayer && setup.picks.length ? h('section', { class: 'card' },
      h('h2', {}, 'Rules per player'),
      setup.picks.map((pick) => {
        setup.playerRules[pick] ??= { ...setup.rules };
        return h('div', { class: 'rules-for', 'data-rules-for': isGuest(setup, pick) ? pick : pickName(pick) },
          h('h3', {}, isGuest(setup, pick) ? pick : pickName(pick)),
          toggles(setup.playerRules[pick]));
      })) : null,

    setup.picks.length >= 2 ? h('section', { class: 'card' },
      h('h2', {}, 'Head start'),
      h('p', { class: 'muted' }, suggested
        ? (isKiller ? 'Suggested from marks per round. Change it if you agree otherwise.' : 'Suggested from three-dart averages. Change it if you agree otherwise.')
        : `Suggested once everyone has ${MIN_GAMES} games under these rules. You can agree one now.`),
      setup.picks.map((pick, index) => h('label', { class: 'head-row' },
        h('span', {}, `${isGuest(setup, pick) ? pick : pickName(pick)} head start`),
        h('input', {
          type: 'number', inputmode: 'numeric', min: 0, max: limit, step: 1,
          value: String(setup.heads[pick] ?? suggested?.[index] ?? 0),
          onchange: (event) => {
            setup.heads[pick] = Math.max(0, Math.min(limit, Math.floor(Number(event.target.value) || 0)));
            event.target.value = String(setup.heads[pick]);
            persist();
          },
        })))) : null,

    h('p', { class: 'notice', id: 'setup-error', role: 'alert', hidden: true }),
    h('div', { class: 'actions' }, h('button', { type: 'button', class: 'primary', onclick: startGame }, 'Start game')));
}

function startGame() {
  const setup = store.setup;
  const problem = setup.picks.length < 2 ? 'Pick at least two players.'
    : setup.game === 'killer' && setup.picks.length !== 2 ? 'Killer has two sides. Pick two players.'
      : setup.picks.length > 4 ? 'Four players at most.' : null;
  if (problem) {
    const element = $('setup-error');
    element.textContent = problem;
    element.hidden = false;
    return;
  }
  const suggested = suggestedHeads(setup);
  store.game = {
    id: crypto.randomUUID(),
    startedAt: Date.now(),
    config: {
      ...setupConfigBase(setup),
      sides: setup.picks.map((pick, index) => ({
        name: isGuest(setup, pick) ? pick : pickName(pick),
        userId: isGuest(setup, pick) ? null : pick,
        head: setup.heads[pick] ?? suggested?.[index] ?? 0,
        rules: rulesFor(setup, pick),
      })),
    },
    events: [],
  };
  setup.heads = {};
  resetPad();
  persist();
  render();
}

// ---- Playing ----

function resetPad() {
  ui.multiplier = 1;
  ui.ask = null;
  ui.placing = null;
  ui.typed = '';
}

function addEvent(event) {
  store.game.events.push(event);
  resetPad();
  persist();
  const state = replay(store.game.config, store.game.events);
  if (store.game.config.game === 'x01' && state.last?.bust && !state.finished) toast('Bust');
  if (store.game.config.game === 'killer' && !state.finished && state.last?.dart) {
    const { last } = state;
    if (last.why === 'dead') toast(`${dartLabel(last.dart)} is dead, no mark`);
    else if (last.why === 'none' && last.dart.n !== 0) toast(`${dartLabel(last.dart)} doesn't count`);
    else if (last.scored) toast(`${last.scored} points`);
  }
  render();
}

function throwDart(n, multiplier) {
  const { game } = store;
  const dart = { n, m: n === 0 ? 1 : multiplier };
  if (game.config.game === 'killer') {
    const state = replay(game.config, game.events);
    if (killerChoice(state, game.config, dart)) {
      ui.placing = dart;
      render();
      return;
    }
  }
  addEvent({ t: 'dart', ...dart });
}

function undo() {
  if (!store.game.events.length) return;
  store.game.events.pop();
  resetPad();
  persist();
  render();
}

function multiplierButtons() {
  return h('div', { class: 'pad-row', role: 'group', 'aria-label': 'Multiplier' },
    [[1, 'Single'], [2, 'Double'], [3, 'Treble']].map(([value, label]) => h('button', {
      type: 'button', 'aria-pressed': String(ui.multiplier === value),
      onclick: () => { ui.multiplier = value; render(); },
    }, label)));
}

const bullButtons = () => h('div', { class: 'pad-row' },
  h('button', { type: 'button', disabled: ui.multiplier === 3, onclick: () => throwDart(25, 1) }, 'Outer bull'),
  h('button', { type: 'button', disabled: ui.multiplier === 3, onclick: () => throwDart(25, 2) }, 'Inner bull'),
  h('button', { type: 'button', onclick: () => throwDart(0, 1) }, 'Miss'));

function visitBoxes(state) {
  return h('div', { class: 'visit', 'aria-label': 'This visit' },
    [0, 1, 2].map((index) => h('span', {}, state.visit[index] ? dartLabel(state.visit[index]) : '')));
}

function gameFooter(state) {
  const isKiller = store.game.config.game === 'killer';
  return h('div', { class: 'actions' },
    h('button', { type: 'button', disabled: !store.game.events.length, onclick: undo }, 'Undo'),
    isKiller ? h('button', {
      type: 'button', class: 'quiet',
      onclick: () => { if (confirm('End the game now? The higher score wins.')) addEvent({ t: 'end' }); },
    }, 'End now') : null,
    h('button', {
      type: 'button', class: 'danger',
      onclick: () => {
        if (!confirm("Throw this game away? It won't count.")) return;
        store.game = null;
        resetPad();
        persist();
        render();
      },
    }, 'Abandon'));
}

function renderX01() {
  const { config, events } = store.game;
  const state = replay(config, events);
  const rules = config.sides[state.turn].rules ?? {};
  const side = state.sides[state.turn];
  const players = h('div', { class: 'players' }, state.sides.map((player, index) => h('div', {
    class: `player${index === state.turn ? ' up' : ''}`, 'data-player': config.sides[index].name,
  },
  h('div', { class: 'name' }, config.sides[index].name),
  h('div', { class: 'left' }, String(player.remaining)),
  h('div', { class: 'sub' }, `${player.darts ? ((player.points / player.darts) * 3).toFixed(1) : '0.0'} average`),
  h('div', { class: 'sub' }, [config.sides[index].rules?.doubleIn ? 'Double in' : 'Straight in', config.sides[index].rules?.doubleOut ? 'double out' : 'straight out'].join(', '), player.opened ? '' : ', not open yet'))));

  const status = h('div', { class: 'status' }, `${config.sides[state.turn].name} to throw`);
  let entry;
  if (ui.ask) {
    entry = renderTotalQuestion(state, rules);
  } else if (ui.entry === 'total' && !state.visit.length) {
    const input = h('input', { type: 'text', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 3, autocomplete: 'off', id: 'total-input', value: ui.typed });
    entry = h('form', {
      onsubmit: (event) => {
        event.preventDefault();
        const total = Number(input.value);
        if (input.value.trim() === '' || !possibleTotal(total)) {
          toast("Three darts can't make that");
          return;
        }
        startTotal(state, rules, total);
      },
    },
    h('label', {}, 'Three-dart total', input),
    h('div', { class: 'actions' }, h('button', { type: 'submit', class: 'primary' }, 'Score it')));
  } else {
    entry = h('div', { class: 'pad' },
      multiplierButtons(),
      h('div', { class: 'pad-numbers' }, Array.from({ length: 20 }, (_, index) => h('button', { type: 'button', onclick: () => throwDart(index + 1, ui.multiplier) }, String(index + 1)))),
      bullButtons());
  }

  return h('div', {},
    players, status,
    visitBoxes(state),
    ui.ask ? null : h('div', { class: 'segments actions', role: 'group', 'aria-label': 'Entry' },
      [['darts', 'Dart by dart'], ['total', 'Three-dart total']].map(([key, label]) => h('button', {
        type: 'button', 'aria-pressed': String(ui.entry === key), disabled: key === 'total' && state.visit.length > 0,
        onclick: () => { ui.entry = key; render(); },
      }, label))),
    h('div', { class: 'card' }, entry),
    side ? gameFooter(state) : null);
}

/** A typed total only needs extra questions when the rules make them matter. */
function startTotal(state, rules, total) {
  const side = state.sides[state.turn];
  ui.ask = { total, opened: side.opened ? undefined : (rules.doubleIn ? null : true), onDouble: undefined, darts: undefined };
  nextTotalStep(state, rules);
}

function nextTotalStep(state, rules) {
  const { ask } = ui;
  const side = state.sides[state.turn];
  if (ask.opened === null) { render(); return; }
  const value = side.opened || ask.opened ? ask.total : 0;
  const finishes = value > 0 && side.remaining === value;
  if (finishes && rules.doubleOut && ask.onDouble === undefined) { render(); return; }
  if (finishes && (!rules.doubleOut || ask.onDouble) && ask.darts === undefined) { render(); return; }
  addEvent({ t: 'total', total: ask.total, opened: Boolean(ask.opened), onDouble: Boolean(ask.onDouble), darts: ask.darts ?? 3 });
}

function renderTotalQuestion(state, rules) {
  const { ask } = ui;
  const yesNo = (question, set) => h('div', {},
    h('p', { class: 'status' }, question),
    h('div', { class: 'pad-row' },
      h('button', { type: 'button', onclick: () => { set(true); nextTotalStep(state, rules); } }, 'Yes'),
      h('button', { type: 'button', onclick: () => { set(false); nextTotalStep(state, rules); } }, 'No'),
      h('button', { type: 'button', class: 'quiet', onclick: () => { ui.ask = null; render(); } }, 'Back')));
  if (ask.opened === null) return yesNo(`Did those ${ask.total} points start with a double?`, (value) => { ask.opened = value; });
  const value = ask.total;
  const finishes = state.sides[state.turn].remaining === value;
  if (finishes && rules.doubleOut && ask.onDouble === undefined) return yesNo('Was the last dart a double?', (answer) => { ask.onDouble = answer; });
  return h('div', {},
    h('p', { class: 'status' }, 'How many darts did the finish take?'),
    h('div', { class: 'pad-row' }, [1, 2, 3].map((darts) => h('button', {
      type: 'button', onclick: () => { ask.darts = darts; nextTotalStep(state, rules); },
    }, String(darts)))));
}

const rowName = (row) => String(row);

function renderKiller() {
  const { config, events } = store.game;
  const state = replay(config, events);
  const [left, right] = state.sides;
  const up = state.turn;
  const rules = config.sides[up].rules ?? {};
  const marks = (side, row) => 'X'.repeat(side.marks[row] ?? 0);

  const board = h('table', { class: 'board', 'aria-label': 'Killer board' },
    h('thead', {},
      h('tr', {},
        h('th', { class: up === 0 ? 'up' : '', colspan: 2, scope: 'col' }, config.sides[0].name),
        h('th', { class: 'row-label', scope: 'col' }, ''),
        h('th', { class: up === 1 ? 'up' : '', colspan: 2, scope: 'col' }, config.sides[1].name)),
      h('tr', {},
        h('th', { class: 'row-total', colspan: 2, id: 'score-0' }, String(left.score)),
        h('th', { class: 'row-label' }, 'Score'),
        h('th', { class: 'row-total', colspan: 2, id: 'score-1' }, String(right.score)))),
    h('tbody', {}, ALL_KILLER_ROWS.map((row) => h('tr', { class: rowDead(state, row) ? 'dead' : '', 'data-row': rowName(row) },
      h('td', { class: `marks${rowOpen(left, row) ? ' open' : ''}`, colspan: 2, 'data-side': '0' }, marks(left, row)),
      h('th', { class: 'row-label', scope: 'row' }, rowName(row)),
      h('td', { class: `marks${rowOpen(right, row) ? ' open' : ''}`, colspan: 2, 'data-side': '1' }, marks(right, row))))));

  let entry;
  if (ui.placing) {
    const dart = ui.placing;
    const effectText = ({ marks: added, scored }) => [
      added ? `${added} ${added === 1 ? 'mark' : 'marks'}` : null,
      scored ? `${scored} points` : null,
    ].filter(Boolean).join(' and ') || 'nothing';
    entry = h('div', {},
      h('p', { class: 'status' }, `Where does ${dartLabel(dart)} go?`),
      h('div', { class: 'choices' },
        killerOptions(state, config, dart).map((option) => h('button', {
          type: 'button',
          onclick: () => addEvent(option.to === 'bonus' ? { t: 'dart', n: dart.n, m: dart.m, to: 'bonus' } : { t: 'dart', n: dart.n, m: dart.m }),
        }, `${option.row} row: ${effectText(option)}`)),
        h('button', { type: 'button', class: 'quiet', onclick: () => { ui.placing = null; render(); } }, 'Back')));
  } else {
    const numberButton = (n) => {
      const target = killerTarget(state, config, { n, m: ui.multiplier });
      return h('button', { type: 'button', class: target || n < 10 ? '' : 'dead', onclick: () => throwDart(n, ui.multiplier) }, String(n));
    };
    entry = h('div', { class: 'pad' },
      multiplierButtons(),
      h('div', { class: 'pad-numbers' }, KILLER_NUMBERS.map(numberButton)),
      rules.countLow && ui.multiplier > 1 ? h('div', { class: 'pad-numbers' }, [9, 8, 7, 6, 5, 4, 3, 2, 1].map(numberButton)) : null,
      bullButtons());
  }

  return h('div', {},
    board,
    h('div', { class: 'status' }, `${config.sides[up].name} to throw`),
    visitBoxes(state),
    h('div', { class: 'card' }, entry),
    gameFooter(state));
}

function buildFinished() {
  const { game } = store;
  const state = replay(game.config, game.events);
  return { id: game.id, playedAt: Date.now(), config: game.config, events: game.events, sides: summarize(game.config, state), comments: [], canVoid: false };
}

function renderFinish() {
  const match = buildFinished();
  const winner = match.sides.find((side) => side.won);
  return h('section', { class: 'card' },
    h('h2', {}, winner ? `${winner.name} wins` : 'A draw'),
    h('p', { class: 'result-line' }, banterLine(match)),
    h('p', { class: 'score' }, scoreLine(match)),
    h('p', { class: 'muted' }, 'Check the last dart. Saving puts it on the ladder for everyone.'),
    h('div', { class: 'actions' },
      h('button', {
        type: 'button', class: 'primary',
        onclick: async () => {
          store.outbox.push(match);
          store.game = null;
          ui.finished = match;
          persist();
          render();
          await syncAll();
          render();
        },
      }, 'Save result'),
      h('button', { type: 'button', onclick: undo }, 'Undo last dart')));
}

function renderResult() {
  const match = ui.finished;
  const waiting = store.outbox.some((item) => item.id === match.id);
  return h('section', { class: 'card' },
    h('h2', {}, 'Saved'),
    h('p', { class: 'result-line' }, banterLine(match)),
    h('p', { class: 'score' }, scoreLine(match)),
    h('ul', { class: 'people' }, match.sides.map((side) => h('li', {}, `${side.name}: ${statLabel(match, side)}`))),
    waiting ? h('p', { class: 'hint', id: 'waiting' }, "You're offline. It will go to the league when you're connected.") : null,
    h('div', { class: 'actions' },
      h('button', { type: 'button', class: 'primary', onclick: () => shareMatch(match) }, 'Share result'),
      h('button', { type: 'button', onclick: () => { ui.finished = null; ui.view = 'play'; render(); } }, 'New game'),
      h('button', { type: 'button', onclick: () => { ui.finished = null; ui.view = 'log'; render(); } }, 'See the banter')));
}

// ---- Sharing ----

function wrapText(context, text, width) {
  const lines = [];
  let line = '';
  for (const word of text.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (context.measureText(next).width > width && line) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** A square picture for WhatsApp, drawn like the chalkboard. */
function drawCard(match) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const context = canvas.getContext('2d');
  const font = 'system-ui, -apple-system, Roboto, sans-serif';
  context.fillStyle = '#141a18';
  context.fillRect(0, 0, 1080, 1080);
  context.strokeStyle = '#f4efe0';
  context.lineWidth = 6;
  context.strokeRect(40, 40, 1000, 1000);
  context.fillStyle = '#f4efe0';
  context.font = `800 64px ${font}`;
  context.fillText('Pyltjies', 90, 140);
  context.font = `400 36px ${font}`;
  context.fillText('for tossers', 90, 190);
  context.font = `800 62px ${font}`;
  let y = 330;
  for (const line of wrapText(context, banterLine(match), 900).slice(0, 6)) {
    context.fillText(line, 90, y);
    y += 78;
  }
  context.font = `600 40px ${font}`;
  y = Math.max(y + 30, 760);
  for (const side of match.sides.slice(0, 4)) {
    context.fillStyle = side.won ? '#7ee2a6' : '#f4efe0';
    const value = match.config.game === 'killer' ? `${side.score} points` : `${side.remaining} left`;
    context.fillText(`${side.name}: ${value}`.slice(0, 44), 90, y);
    y += 54;
  }
  context.fillStyle = '#8f958c';
  context.font = `400 32px ${font}`;
  context.fillText(matchName(match.config).slice(0, 56), 90, 1000);
  return new Promise((resolve) => { canvas.toBlob(resolve, 'image/png'); });
}

async function shareMatch(match) {
  const text = shareText(match, matchName(match.config));
  try {
    const blob = await drawCard(match);
    const file = blob ? new File([blob], 'pyltjies-result.png', { type: 'image/png' }) : null;
    if (file && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], text });
      return;
    }
    if (navigator.share) {
      await navigator.share({ text });
      return;
    }
    await navigator.clipboard.writeText(text);
    toast('Copied. Paste it into WhatsApp.');
  } catch (error) {
    if (error.name !== 'AbortError') toast("Couldn't share that. Try again.");
  }
}

// ---- Banter log ----

const dayLabel = (at) => new Date(at).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });

function matchCard(match, { pending = false } = {}) {
  const input = h('input', { type: 'text', maxlength: 280, autocomplete: 'off', 'aria-label': 'Add banter' });
  return h('article', { class: 'card match', 'data-match': match.id },
    h('div', { class: 'meta' }, `${dayLabel(match.playedAt)} · ${matchName(match.config)}`),
    h('p', { class: 'line' }, banterLine(match)),
    h('p', { class: 'score' }, scoreLine(match)),
    h('p', { class: 'meta' }, match.sides.map((side) => `${side.name} ${statLabel(match, side)}`).join(' · ')),
    pending ? h('p', { class: 'hint' }, 'Waiting for a connection') : null,
    match.comments?.length ? h('ul', { class: 'comments' }, match.comments.map((comment) => h('li', {}, h('b', {}, `${comment.name}: `), comment.text))) : null,
    pending ? null : h('form', {
      class: 'inline-form',
      onsubmit: async (event) => {
        event.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        try {
          await api('POST', '/api/comments', { matchId: match.id, text });
          await refreshLeague();
          render();
        } catch (error) {
          toast(error.message);
        }
      },
    }, h('label', {}, input), h('button', { type: 'submit' }, 'Say it')),
    h('div', { class: 'actions' },
      h('button', { type: 'button', onclick: () => shareMatch(match) }, 'Share'),
      match.canVoid ? h('button', {
        type: 'button', class: 'danger',
        onclick: async () => {
          if (!confirm('Void this game? It stops counting on the ladder and handicaps.')) return;
          try {
            await api('POST', '/api/matches/void', { id: match.id });
            await refreshLeague();
            render();
          } catch (error) {
            toast(error.message);
          }
        },
      }, 'Void') : null));
}

function renderLog() {
  const matches = store.league?.matches ?? [];
  const pending = store.outbox;
  if (!matches.length && !pending.length) {
    return h('section', { class: 'card' }, h('h2', {}, 'Banter'), h('p', { class: 'muted' }, 'Nothing yet. Go and embarrass someone.'));
  }
  return h('div', {}, pending.map((match) => matchCard(match, { pending: true })), matches.map((match) => matchCard(match)));
}

// ---- Ladder ----

function renderLadder() {
  const ladder = store.league?.ladder ?? [];
  const formats = Object.entries(store.league?.formats ?? {});
  const mine = ladderEntry(me.id);
  const nameOf = (id) => ladder.find((player) => player.id === id)?.name ?? '';
  const statHeading = (key) => (key.startsWith('killer') ? 'Marks per round' : 'Three-dart average');
  return h('div', {},
    h('section', { class: 'card' },
      h('h2', {}, 'Ladder'),
      h('table', { class: 'ladder', id: 'ladder' },
        h('thead', {}, h('tr', {}, ['#', 'Player', 'Pts', 'W', 'L', 'D'].map((label) => h('th', { scope: 'col' }, label)))),
        h('tbody', {}, ladder.map((player, index) => h('tr', {},
          h('td', {}, h('span', { class: `ball ball-${Math.min(index + 1, 7)}` }, String(index + 1))), h('td', {}, `${player.name}${player.id === me.id ? ' (you)' : ''}`, h('small', { class: 'rank' }, ladderRank(index, ladder.length))),
          h('td', {}, String(player.points)), h('td', {}, String(player.wins)), h('td', {}, String(player.losses)), h('td', {}, String(player.draws)))))),
      h('p', { class: 'muted' }, 'A win scores more under harder rules, using the rules the winner played.')),
    mine && Object.keys(mine.rivals).length ? h('section', { class: 'card' },
      h('h2', {}, 'Your rivals'),
      h('ul', { class: 'people', id: 'rivals' }, Object.entries(mine.rivals).map(([id, rival]) => h('li', {},
        `${nameOf(id)}: ${rival.wins} won, ${rival.losses} lost${rival.draws ? `, ${rival.draws} drawn` : ''}`)))) : null,
    h('section', { class: 'card', id: 'handicaps' },
      h('h2', {}, 'Handicaps'),
      h('p', { class: 'muted' }, `Like golf: the best ${8} of your last ${20} games under the same rules. A rating appears after ${MIN_GAMES} games.`),
      formats.length ? formats.map(([key, name]) => h('div', {},
        h('h3', {}, name),
        h('p', { class: 'muted' }, statHeading(key)),
        h('ul', { class: 'people' }, ladder.filter((player) => key in player.ratings).map((player) => h('li', {},
          `${player.name}: ${player.ratings[key] === null ? 'not rated yet' : player.ratings[key].toFixed(key.startsWith('killer') ? 2 : 1)}`))))) : h('p', { class: 'muted' }, 'No games yet.')));
}

// ---- You ----

const NEW_FOR_MS = 7 * 86_400_000;

function memberLine(member) {
  const seen = member.lastSeenAt ? `, last seen ${dayLabel(member.lastSeenAt)}` : '';
  return h('li', {},
    `${member.name}${member.you ? ' (you)' : ''}`,
    member.joinedAt && Date.now() - member.joinedAt < NEW_FOR_MS ? h('span', { class: 'new-tag' }, 'New') : null,
    member.joinedAt ? h('small', { class: 'rank' }, `Joined ${dayLabel(member.joinedAt)}${seen}`) : null);
}

/** One tap: make a link and open the phone's share sheet. The link also stays on screen, in case sharing is refused. */
async function shareInvite() {
  try {
    ui.invites = (await api('POST', '/api/invites', {})).invites;
  } catch (error) {
    toast(error.message);
    return;
  }
  ui.view = 'you';
  render();
  const { url } = ui.invites[0];
  try {
    if (navigator.share) {
      await navigator.share({ title: 'Pyltjies', text: 'Come and lose at darts on Pyltjies.', url });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast('Invite link copied');
  } catch (error) {
    if (error.name !== 'AbortError') toast('Your invite link is on this screen. Copy it from there.');
  }
}

function renderYou() {
  const emailInput = h('input', { type: 'email', autocomplete: 'off', inputmode: 'email' });
  const showInvite = (invite) => h('li', {},
    invite.email ?? 'Anyone with this link, once',
    h('span', { class: 'invite-link' }, invite.url),
    h('div', { class: 'actions' }, h('button', {
      type: 'button',
      onclick: async () => {
        try {
          if (navigator.share) await navigator.share({ text: 'Come and lose at darts on Pyltjies.', url: invite.url });
          else {
            await navigator.clipboard.writeText(invite.url);
            toast('Link copied');
          }
        } catch (error) {
          if (error.name !== 'AbortError') toast("Couldn't share that. Copy the link instead.");
        }
      },
    }, 'Share link')));
  const invite = async (body) => {
    try {
      ui.invites = (await api('POST', '/api/invites', body)).invites;
      render();
    } catch (error) {
      toast(error.message);
    }
  };
  return h('div', {},
    h('section', { class: 'card' },
      h('h2', {}, me.name),
      h('p', { class: 'muted' }, me.email),
      h('h3', {}, 'The league'),
      h('ul', { class: 'people', id: 'people' }, members().map(memberLine))),
    h('section', { class: 'card' },
      h('h2', {}, 'Invite a friend'),
      h('p', { class: 'muted' }, 'Each link works for one person and lasts 7 days.'),
      h('div', { class: 'actions' }, h('button', { type: 'button', class: 'primary', onclick: shareInvite }, 'Share an invite')),
      h('form', {
        class: 'inline-form',
        onsubmit: (event) => { event.preventDefault(); if (emailInput.value) invite({ email: emailInput.value }); },
      }, h('label', {}, 'Or send it to an email', emailInput), h('button', { type: 'submit' }, 'Send')),
      h('ul', { class: 'people', id: 'invites' }, ui.invites.map(showInvite))),
    h('section', { class: 'card' },
      h('h2', {}, 'On your iPhone'),
      h('p', { class: 'muted' }, 'Open this in Safari, tap Share, then Add to Home Screen.'),
      h('div', { class: 'actions' }, h('button', {
        type: 'button', class: 'quiet',
        onclick: async () => {
          await api('POST', '/api/auth/logout').catch(() => {});
          signOutHere();
        },
      }, 'Sign out'))));
}

// ---- Frame ----

function render() {
  if (!me) return;
  const screen = $('screen');
  const nav = $('nav');
  const playing = Boolean(store.game);
  nav.hidden = playing;
  for (const button of nav.querySelectorAll('button')) {
    if (button.dataset.view === ui.view) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  let content;
  if (playing) {
    const state = replay(store.game.config, store.game.events);
    if (state.finished) content = renderFinish();
    else content = store.game.config.game === 'killer' ? renderKiller() : renderX01();
  } else if (ui.finished) {
    content = renderResult();
  } else if (ui.view === 'log') {
    content = renderLog();
  } else if (ui.view === 'ladder') {
    content = renderLadder();
  } else if (ui.view === 'you') {
    content = renderYou();
  } else {
    content = renderSetup();
  }
  screen.replaceChildren(content);
  if (playing && ui.entry === 'total') $('total-input')?.focus();
}

function showError(id, message) {
  const element = $(id);
  element.textContent = message;
  element.hidden = !message;
}

function showSignIn() {
  me = null;
  $('view-signin').hidden = false;
  $('nav').hidden = true;
  $('who').hidden = true;
  $('screen').replaceChildren();
  $('email-form').hidden = false;
  $('code-form').hidden = true;
}

function signOutHere() {
  if (me) {
    try {
      localStorage.removeItem(storeKey());
      localStorage.removeItem(USER_KEY);
    } catch {
      // Nothing to clear.
    }
  }
  store = { league: null, game: null, outbox: [], setup: null };
  showSignIn();
}

async function enterApp() {
  $('view-signin').hidden = true;
  $('who').textContent = me.name;
  $('who').hidden = false;
  writeStorage(USER_KEY, me);
  store = { league: null, game: null, outbox: [], setup: null, ...readStorage(storeKey()) };
  store.setup ??= defaultSetup();
  if (signIn.invite) history.replaceState(null, '', location.pathname);
  render();
  await syncAll();
  api('GET', '/api/invites').then(({ invites }) => { ui.invites = invites; }).catch(() => {});
  if (me && !document.activeElement?.matches('input')) render();
}

$('nav').addEventListener('click', async (event) => {
  const view = event.target.dataset?.view;
  if (!view) return;
  ui.view = view;
  ui.finished = null;
  render();
  if (view !== 'play') {
    await syncAll();
    if (ui.view === view && !document.activeElement?.matches('input')) render();
  }
});

$('email-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  showError('signin-error', '');
  const email = new FormData(event.target).get('email');
  try {
    const result = await api('POST', '/api/auth/start', { email, invite: signIn.invite });
    signIn.email = result.email;
    signIn.isNew = result.isNew;
    $('code-sent').textContent = `We sent a code to ${result.email}.`;
    $('name-field').hidden = !result.isNew;
    $('email-form').hidden = true;
    $('code-form').hidden = false;
    $('code-form').elements.code.focus();
  } catch (error) {
    showError('signin-error', error.message);
  }
});

$('code-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  showError('signin-error', '');
  const data = new FormData(event.target);
  try {
    const { user } = await api('POST', '/api/auth/verify', { email: signIn.email, code: data.get('code'), name: data.get('name'), invite: signIn.invite });
    me = user;
    await enterApp();
  } catch (error) {
    showError('signin-error', error.message);
  }
});

$('code-back').addEventListener('click', () => {
  $('email-form').hidden = false;
  $('code-form').hidden = true;
  showError('signin-error', '');
});

window.addEventListener('online', () => { if (me) syncAll(); });

async function boot() {
  $('version').textContent = `Pyltjies ${APP_VERSION}`;
  try {
    me = (await api('GET', '/api/me')).user;
  } catch (error) {
    if (!error.offline) {
      signOutHere();
      if (error.status !== 401) showError('signin-error', error.message);
      return;
    }
    me = readStorage(USER_KEY);
    if (!me) {
      showSignIn();
      showError('signin-error', error.message);
      return;
    }
  }
  await enterApp();
}

boot();

if ('serviceWorker' in navigator) {
  // An open app keeps running the code it loaded, so a new release has to reload it.
  // The first install also takes control, and that one must not reload.
  let hadWorker = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadWorker) {
      hadWorker = true;
      return;
    }
    if (reloading) return;
    reloading = true;
    location.reload();
  });
  navigator.serviceWorker.register('sw.js').then((registration) => {
    const checkForUpdate = () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {});
    };
    document.addEventListener('visibilitychange', checkForUpdate);
    window.addEventListener('online', checkForUpdate);
    setInterval(checkForUpdate, 60 * 60 * 1000);
  }).catch(() => {});
}

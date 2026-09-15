// S5 Crew screen + crew dialogue popup (DOM-114).
// Part of the suite; run it all with `node tests/run.js`.
//
// tests/crew.test.js is DOM-75's capacity/loadout maths and stays its own file
// (DOM-127: add a file, never append to another area's).

const {
  fs, path, vm, assert, ROOT, readAllCss, TUNE, tune, test,
} = require('./harness');

const CREW_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/crew.json'), 'utf8'));
const PORTRAITS_JSON = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/portraits.json'), 'utf8'));
const CITY = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/city.json'), 'utf8'));

// crew.js is a plain script leaning on browser globals. The sandbox supplies
// what the render path touches and hands back the markup it produced.
function renderCrewWith(over) {
  const o = over || {};
  let html = '';
  const ctx = {
    console, JSON, Object, Math, Array, String, Number,
    CREW_DATA: 'crewData' in o ? o.crewData : CREW_JSON,
    PORTRAITS: { plugs: PORTRAITS_JSON.plugs, enemies: {} },
    TUNING: TUNE,
    tune: p => tune(p, TUNE),
    G: { crewMemberCount: o.count || 0, recruitedBy: null },
    Auth: { canPrompt: () => !!o.guest, copy: () => ({
      crewTitle: 'PLAYING AS A GUEST', crewBody: 'Claim your account.', crewCta: 'CLAIM YOUR ACCOUNT',
    }) },
    $: id => (id === 'tab-crew' ? { set innerHTML(v) { html = v; }, get innerHTML() { return html; } } : null),
    registerScreen: () => {},
    showTab: () => {}, GameMap: { centerOn: () => {} },
    GameState: { save: () => {} }, addClout: () => {}, log: () => {},
    REASON: { RECRUIT_BONUS: 'recruit_bonus' },
  };
  const src = fs.readFileSync(path.join(ROOT, 'js/crew.js'), 'utf8')
    + '\n;globalThis.__t = { Crew, renderCrew, crewMember, crewCount, crewGoToMap,'
    + ' _crewLieutenantCard, _crewNpcCard };';
  vm.runInNewContext(src, ctx);
  ctx.__t.Crew._memberCount = o.count || 0;
  ctx.__t.renderCrew();
  return Object.assign({}, ctx.__t, { html });
}

console.log('\nS5 Crew screen — DOM-114');

// ─────────────────────────────────────────────
//  The ruling: the invite must never become unreachable
// ─────────────────────────────────────────────

test('the invite stays reachable at every roster size', () => {
  // This is the whole reason DOM-114 was blocked. The Crew tab is the ONLY
  // entry point to Crew.invite(), which feeds a 250-Clout-per-recruit faucet
  // and the entire bonus-gear-slot ladder. Rendering the prototype's three NPC
  // "roster" characters over it would have made both unreachable, silently.
  for (const count of [0, 1, 4, 5, 12, 45, 200]) {
    const r = renderCrewWith({ count });
    assert.ok(/onclick="Crew\.invite\(\)"/.test(r.html),
      'no way to invite at ' + count + ' Lieutenants');
  }
});

test('a guest gets the register prompt instead, in the same row', () => {
  // 07-external-systems.md lists crew.js as a registration-prompt surface; the
  // v0.1 screen's CLAIM YOUR ACCOUNT card was all of it. A guest's referrals
  // have no account to hang off, so claiming comes before inviting.
  const guest = renderCrewWith({ count: 0, guest: true });
  assert.ok(/Auth\.promptRegister\('crew'/.test(guest.html), 'the guest prompt is gone');
  assert.ok(/PLAYING AS A GUEST/.test(guest.html));
  // and it is not doubled up with the invite CTA
  assert.ok(!/Crew\.invite\(\)/.test(guest.html), 'a guest is offered both at once');
});

test('the gear-slot ladder stays legible without a card the prototype lacks', () => {
  // Option 2 (a referral card on top of the roster) was rejected for failing the
  // side-by-side check. The mechanic still has to be visible somewhere, so it
  // rides on the invite row, which the prototype does have.
  const per = tune('crew.lieutenantsPerSlot', TUNE);
  assert.strictEqual(renderCrewWith({ count: 1 }).html.match(/(\d+) more for a \+1 (\w+) slot/)[0],
    (per - 1) + ' more for a +1 weapon slot');
  assert.ok(/5 more for a \+1 armor slot/.test(renderCrewWith({ count: per }).html));
  // past the cap there is nothing left to earn, and it says so rather than
  // promising a slot that will never come
  const maxed = renderCrewWith({ count: 500 }).html;
  assert.ok(/Every bonus slot earned/.test(maxed));
  assert.ok(!/more for a \+1/.test(maxed));
});

// ─────────────────────────────────────────────
//  Honesty: a Lieutenant is a real person
// ─────────────────────────────────────────────

test('a Lieutenant card claims nothing the referral feed can tell us', () => {
  // The feed gives a count. It does not give a name, a location, a status or a
  // line — so the card carries none of those affordances. Inventing
  // "Servin' · 5th & Lenox" for a real player is the one thing this must not do.
  const r = renderCrewWith({ count: 3 });
  // The builder's whole output, not a slice of the page: slicing the rendered
  // HTML on a closing tag silently stopped short of the portrait panel, so a
  // pin added there did not trip this.
  for (const n of [1, 2, 3]) {
    const card = r._crewLieutenantCard(n);
    assert.ok(!/crew-pin/.test(card), 'a Lieutenant has a map pin, but no location');
    assert.ok(!/openCrewMember/.test(card), 'a Lieutenant opens a dialogue, but has no line');
    assert.ok(!/is-working/.test(card), 'a Lieutenant shows a working dot we cannot know');
    assert.ok(!/<img/.test(card), 'a Lieutenant has portrait art that is not theirs');
    assert.ok(card.indexOf('LIEUTENANT 0' + n) !== -1);
  }
  // and an NPC card is the contrast: it has every one of those
  const npc = r._crewNpcCard(CREW_JSON.sections[0].members[0]);
  assert.ok(/crew-pin/.test(npc) && /openCrewMember/.test(npc) && /<img/.test(npc));
  assert.ok(/LIEUTENANT 01/.test(r.html) && /LIEUTENANT 03/.test(r.html));
});

test('MY ROSTER is not in crew.json — it is live data, and must stay that way', () => {
  // Re-adding the prototype's DIAMOND / PRECIOUS / MERCEDES here would quietly
  // undo the ruling: the section would fill with NPCs and the invite CTA, which
  // is its empty state, would stop being reached.
  // Structure, not raw text: the file's own _note explains that MY ROSTER is
  // not here, and a grep over the source matches that explanation.
  assert.deepStrictEqual(CREW_JSON.sections.map(s => s.key), ['hitters', 'dealers']);
  assert.ok(!CREW_JSON.sections.some(s => /roster/i.test(s.title || '')));
  const ids = CREW_JSON.sections.reduce((a, s) => a.concat(s.members.map(m => m.id)), []);
  for (const npc of ['diamond', 'precious', 'mercedes']) {
    assert.ok(ids.indexOf(npc) === -1, 'the prototype roster NPC ' + npc + ' is back');
  }
  // and the section still renders, from the live count
  assert.ok(/MY ROSTER/.test(renderCrewWith({ count: 0 }).html));
});

// ─────────────────────────────────────────────
//  The NPC half
// ─────────────────────────────────────────────

test('every NPC resolves a portrait and stands inside the city', () => {
  const members = CREW_JSON.sections.reduce((a, s) => a.concat(s.members), []);
  assert.ok(members.length >= 6);
  const ids = new Set();
  for (const m of members) {
    assert.ok(PORTRAITS_JSON.plugs[m.slot], m.id + ' has no portrait for slot ' + m.slot);
    assert.ok(m.loc.x > 0 && m.loc.x < CITY.W, m.id + ' is off the map in x');
    assert.ok(m.loc.y > 0 && m.loc.y < CITY.H, m.id + ' is off the map in y');
    assert.ok(m.line && m.doing && m.name, m.id + ' is missing dialogue copy');
    assert.ok(!ids.has(m.id), 'duplicate id ' + m.id);
    ids.add(m.id);
  }
});

test('the map pin does not open the dialogue it sits on top of', () => {
  // The pin is inside the card's tap target by design (it straddles the
  // portrait edge). Without stopPropagation, every pin press also fires the
  // dialogue behind it.
  const html = renderCrewWith({ count: 0 }).html;
  const pins = html.match(/class="crew-pin"[^>]*onclick="([^"]*)"/g) || [];
  assert.strictEqual(pins.length, 6, 'expected one pin per NPC');
  for (const p of pins) {
    assert.ok(/event\.stopPropagation\(\)\s*;\s*crewGoToMap/.test(p), 'pin fires through to the card: ' + p);
  }
});

test('counts are zero-padded, as the section headers print them', () => {
  const r = renderCrewWith({ count: 7 });
  assert.strictEqual(r.crewCount(1), '01');
  assert.strictEqual(r.crewCount(7), '07');
  assert.strictEqual(r.crewCount(10), '10');
  assert.strictEqual(r.crewCount(120), '120');
  assert.ok(/>01</.test(r.html) && /># HITTERS|HITTERS/.test(r.html));
});

test('a missing crew.json leaves the roster and the invite standing', () => {
  // The fetch degrades to null like every other content file. The NPC sections
  // go quiet; the half that is real — Lieutenants and the invite — does not.
  const r = renderCrewWith({ crewData: null, count: 2 });
  assert.ok(/MY ROSTER/.test(r.html));
  assert.ok(/Crew\.invite\(\)/.test(r.html));
  assert.ok(/LIEUTENANT 02/.test(r.html));
  assert.ok(!/HITTERS/.test(r.html));
});

// ─────────────────────────────────────────────
//  Shell and geometry
// ─────────────────────────────────────────────

test('the popup reuses the plug shell rather than cloning it', () => {
  const css = readAllCss();
  const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.ok(/id="crew-overlay"[\s\S]{0,400}class="plug-modal"/.test(index),
    'the crew popup no longer uses the shared panel');
  // The open animation must not be scoped to one overlay id, or it plays for
  // whichever screen got there first and silently not for the other.
  assert.ok(/\.overlay\.open \.plug-modal/.test(css), 'the open state is id-scoped again');
  assert.ok(!/#plug-overlay\.open/.test(css));
});

test('the screen carries the doc geometry', () => {
  const css = readAllCss();
  assert.ok(/\.crew-sections\s*\{[^}]*gap:\s*22px/.test(css), '22px section gaps');
  assert.ok(/\.crew-list\s*\{[^}]*gap:\s*9px/.test(css), '9px between cards');
  assert.ok(/\.crew-list\s*\{[^}]*margin-top:\s*13px/.test(css), '13px below the header');
  assert.ok(/\.crew-card\s*\{[^}]*height:\s*92px/.test(css), '92px card');
  assert.ok(/\.crew-portrait\s*\{[^}]*width:\s*33%/.test(css), '33% portrait panel');
  assert.ok(/\.crew-pin\s*\{[^}]*top:\s*31px/.test(css) && /\.crew-pin\s*\{[^}]*left:\s*-15px/.test(css),
    'the pin straddles the portrait edge');
  assert.ok(/\.crew-modal-portrait-wrap\s*\{[^}]*height:\s*268px/.test(css), '268px popup portrait');
});

test('the v0.1 crew screen left no CSS behind', () => {
  // 20-legacy.css is "v0.1 screens not yet rebuilt; shrinks as each one lands"
  // (CLAUDE.md). Leaving the old rules there is not harmless: .crew-invite-btn
  // carried width:100%, which reached straight into the rebuilt screen and
  // collapsed the invite row, because both rules are a single class and the
  // later file only wins for the properties it names.
  const legacy = fs.readFileSync(path.join(ROOT, 'css/20-legacy.css'), 'utf8');
  for (const dead of ['crew-stats', 'crew-stat-val', 'crew-claim-btn', 'crew-refresh-btn',
                      'crew-empty', 'crew-active', 'crew-rules']) {
    assert.ok(!legacy.includes(dead), '20-legacy.css still owns .' + dead);
  }
  // and nothing renders those classes any more either
  const js = fs.readFileSync(path.join(ROOT, 'js/crew.js'), 'utf8');
  for (const dead of ['crew-stat-val', 'crew-claim-btn', 'crew-refresh-btn', 'crew-rules']) {
    assert.ok(!js.includes(dead), 'js/crew.js still renders .' + dead);
  }
});

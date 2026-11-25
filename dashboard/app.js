// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, a filterable table, a per-protocol detail view with the model's own
// inputs and the protocol's farm plan, and the full methodology. No network: every byte it shows
// is in data.js.
//
// The page recomputes every row from the snapshot figures and checks the number board.json
// carries, so the page's code and the board's data are visibly the same arithmetic:
//
//   implied = round( tvl_usd x multiple x momentumFactor(change_7d) x maturityFactor(age_days) )
//
// where multiple is the category's fitted median mcap/TVL among the snapshot's tokened peers
// (or the global median when the category has fewer than 3 peers), momentumFactor clamps the
// seven-day change to [-60, 120] and weights it by 0.5, and maturityFactor rises from 0.6 to 1.0
// over 1,095 days with no token. Token odds blend the category's launch rate with the age band's
// launch rate; they decide the farm verdict, they never multiply the value.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var app = document.getElementById('board');
  var state = { q: '', category: 'all', watchlistOnly: false, tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The model in three functions, the same arithmetic main.ts runs. The multiple is fitted from
  // the snapshot's tokened peers and carried per row; the page never invents one.
  function momentumFactor(change7d, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, change7d === null || change7d === undefined ? 0 : change7d));
    return 1 + (growth / 100) * model.growth_weight;
  }
  function maturityFactor(ageDays, model) {
    var age = ageDays === null || ageDays === undefined ? DATA.fitted.median_age_days : ageDays;
    return model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  }
  function computeComparables(row, model) {
    return Math.max(1, Math.round(row.tvl_usd * row.multiple * momentumFactor(row.change_7d, model) * maturityFactor(row.age_days, model)));
  }
  function impliedOf(row, model) { return computeComparables(row, model); }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: verdict, category, chains,
  // TVL and age decide the action, the capital, the hold and every cost and time. No name is special-cased.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function gasFor(chain) {
    var c = (chain || '').toLowerCase();
    if (c === 'ethereum') return { perTx: '$2–$15 of gas', weekly: 'about $5 of gas a week' };
    if (c === 'solana') return { perTx: 'about $0.01 of gas', weekly: 'about $0.05 of gas a week' };
    if (c === 'arbitrum' || c === 'optimism' || c === 'base' || c === 'zksync' || c === 'linea' || c === 'scroll' || c === 'blast' || c === 'mode') {
      return { perTx: 'about $0.05–$0.50 of gas', weekly: 'about $0.20 of gas a week' };
    }
    return { perTx: 'about $0.10–$2 of gas', weekly: 'about $1 of gas a week' };
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('lend') >= 0 || c.indexOf('cdp') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('yield') >= 0 || c.indexOf('leveraged farm') >= 0) return 'Provide $' + capital + ' of liquidity to ' + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('staking') >= 0 || c.indexOf('restak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('rwa') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('risk') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function buildFarmPlan(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasFor(chain);
    var action = actionFor(p, capital, chain);
    var first = p.verdict === 'Farm now'
      ? 'Start this one now: the model rates it Farm now, so open the position this week while the window is open.'
      : p.verdict === 'Watch'
        ? 'Watch this one first: open a small position to learn the app, and scale it up only if the protocol ships a points program.'
        : 'Do not chase this one: the model rates it Skip, so keep the position tiny or wait for a points program before committing funds.';
    return [
      { text: first, cost: 'nothing to decide yet', time: '5 minutes' },
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction', time: '5 minutes' },
      { text: action, cost: '$' + capital + ' of capital and ' + gas.perTx, time: '15 minutes to set up' },
      { text: 'Make one qualifying action each week, such as a deposit, a borrow, a swap or a vote.', cost: gas.weekly, time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('watchlist') === '1') state.watchlistOnly = true;
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.watchlistOnly) params.set('watchlist', '1');
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function isWatchlist(r) { return r.watchlist === true; }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchlistOnly && !isWatchlist(r)) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'odds') { av = a.token_odds; bv = b.token_odds; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function verdictClass(v) { return v === 'Farm now' ? 'farm' : v === 'Watch' ? 'watch' : 'skip'; }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function integrityStrip() {
    var farmNow = DATA.rows.filter(function (r) { return r.verdict === 'Farm now'; }).length;
    return el('div', { class: 'strip' },
      el('span', null, el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size }), ' watchlist covered'),
      el('span', null, el('b', { text: String(DATA.board_size) }), ' pre-token rows scored'),
      el('span', null, el('b', { text: String(DATA.early_size) }), ' early rows below the floor'),
      el('span', null, el('b', { text: String(farmNow) }), ' rated Farm now'),
      el('span', null, el('b', { text: String(DATA.live_size) }), ' live-token protocols set aside'),
      el('span', null, 'Model ', el('b', { text: DATA.model_version }), ' · no hand-picked names · deterministic')
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols below that floor, each passing the same exclusion rule. Implied value is a model, not a promise.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Top implied value' }), el('b', { text: fmtUsd(DATA.rows[0] ? DATA.rows[0].implied_value_usd : 0) })),
        el('div', { class: 'fact' }, el('span', { text: 'Live-token set aside' }), el('b', { text: String(DATA.live_size) }))
      )
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var select = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    select.addEventListener('change', function () { state.category = select.value; writeHash(); render(); });
    var wl = el('button', { type: 'button', 'aria-pressed': state.watchlistOnly ? 'true' : 'false', text: 'Watchlist only', onclick: function () { state.watchlistOnly = !state.watchlistOnly; writeHash(); render(); } });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), select),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Scope' }), el('div', { class: 'tabs' }, wl)),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.watchlistOnly = false; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', { class: 'num', text: (r.token_odds * 100).toFixed(0) + '%' }),
        el('td', null, el('span', { class: 'verdict ' + verdictClass(r.verdict), text: r.verdict }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model, its token odds and its farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('implied', 'Implied value'),
            sortHeader('odds', 'Token odds'),
            el('th', { scope: 'col', text: 'Verdict' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var f = DATA.fitted;
    var bands = f.age_band_launch_rate.map(function (r) { return (r * 100).toFixed(0) + '%'; }).join(' · ');
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x multiple x (1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + ') x (' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + ') )'
      ),
      el('ul', null,
        el('li', null, el('b', { text: 'Multiple. ' }), 'The median mcap/TVL of the tokened peers in the same category (' + f.peer_count + ' peers with a market cap and TVL, exchanges excluded), at least ' + m.min_peers + ' peers or the global median of ' + f.global_multiple + ' is used instead. Multiples are clamped to [' + m.multiple_floor + ', ' + m.multiple_cap + '].'),
        el('li', null, el('b', { text: 'Growth. ' }), 'Seven-day TVL change, clamped to [' + m.growth_floor + ', ' + m.growth_cap + '] per cent and weighted by ' + m.growth_weight + '. A missing change is neutral (1.0), never zero.'),
        el('li', null, el('b', { text: 'Maturity. ' }), 'Age with no token, from the first day DefiLlama tracked the protocol. An unknown age uses the snapshot median of ' + f.median_age_days + ' days.'),
        el('li', null, el('b', { text: 'Token odds. ' }), 'The category launch rate (smoothed toward the global ' + (f.global_launch_rate * 100).toFixed(0) + '%) blended half-and-half with the age band rate (' + bands + ' for 0–6 months, 6–12 months, 1–2 years, 2–3 years, over 3 years). Odds decide the verdict; they never multiply the value.'),
        el('li', null, el('b', { text: 'Held-out check. ' }), 'Multiples fitted on half the tokened peers, tested on the other half (n=' + f.heldout_n + '): median error ' + f.heldout_median_error_pct + '%, 75th percentile ' + f.heldout_p75_error_pct + '%. The multiple sets the level for ranking; it is not a price prediction.'),
        el('li', null, el('b', { text: 'No concentration factor. ' }), 'The snapshot carries no per-chain TVL, so none is invented.'),
        el('li', null, el('b', { text: 'Coverage. ' }), 'The board holds all ' + DATA.watchlist_size + ' watchlist protocols plus ' + DATA.early_size + ' early rows below the $' + Math.round(DATA.floor_usd / 1e6) + 'M floor, each passing the same exclusion rule as the watchlist. ' + DATA.live_size + ' live-token protocols are set aside with their market caps shown.'),
        el('li', null, el('b', { text: 'Determinism. ' }), 'Two runs on the same snapshot produce byte-identical output: no clock, no randomness, no network.')
      ),
      el('p', { class: 'note', text: 'Source: ' + DATA.source + '. Snapshot date ' + DATA.as_of + '. Implied value is an estimate, not a price.' })
    );
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var steps = buildFarmPlan(row);
    var recomputed = impliedOf(row, DATA.model);
    var expected = Math.round(row.implied_value_usd * row.token_odds);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.slice(0, 4).join(', ') + (row.chains.length > 4 ? ' +' + (row.chains.length - 4) + ' more' : '') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('div', { class: 'verdict-line' },
        el('span', { class: 'verdict ' + verdictClass(row.verdict), text: row.verdict }),
        el('span', { class: 'reason', text: row.verdict_reason + '.' })
      ),
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num', text: String(row.multiple) + (row.multiple_peers > 0 ? ' (' + row.multiple_peers + ' peers)' : ' (global median)') })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: String(row.growth_multiplier) })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: String(row.maturity_multiplier) })),
        el('div', null, el('span', { text: 'Token odds' }), el('b', { class: 'num', text: (row.token_odds * 100).toFixed(0) + '% (category ' + (row.category_launch_rate * 100).toFixed(0) + '%, age band ' + (row.age_band_launch_rate * 100).toFixed(0) + '%)' })),
        el('div', { class: 'total' }, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(recomputed) + (recomputed === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' Expected value at the token odds is ' + fmtUsd(expected) + '. This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function footer() {
    return el('footer', { class: 'footer' },
      el('p', { text: 'Token Radar · ' + DATA.model_version + ' model · Snapshot ' + DATA.as_of + ' · ' + DATA.source + ' · Two runs on the same snapshot produce byte-identical output.' })
    );
  }

  function renderBoard() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(integrityStrip());
    shell.appendChild(lede());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  renderBoard();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();

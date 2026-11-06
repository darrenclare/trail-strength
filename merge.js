/* Trail Strength — merge two copies of the app's data (used by the browser and by /api/sync).
   Every record carries a timestamp; for each record the newer copy wins, so logging on
   two devices never overwrites anything. Deleted weigh-ins are kept as tombstones. */
(function (root) {
  const tOf = x => (x && typeof x.t === 'number') ? x.t : 0;

  function byKeyNewest(listA, listB, keyFn) {
    const m = new Map();
    for (const e of [...(listA || []), ...(listB || [])]) {
      const k = keyFn(e), cur = m.get(k);
      if (!cur || tOf(e) > tOf(cur)) m.set(k, e);
    }
    return [...m.values()];
  }

  function mergeAF(a, b) {
    a = a || {}; b = b || {};
    const out = {};
    const aS = a.startT || 0, bS = b.startT || 0;
    const sSrc = bS > aS ? b : a;
    out.start = sSrc.start || a.start || b.start;
    out.startT = Math.max(aS, bS);
    const ta = a.t || {}, tb = b.t || {}, t = {};
    const st = (A, d) => (A.af || []).includes(d) ? 'af' : (A.drinks || []).includes(d) ? 'dr' : '';
    const days = new Set([...(a.af || []), ...(a.drinks || []), ...(b.af || []), ...(b.drinks || []), ...Object.keys(ta), ...Object.keys(tb)]);
    const af = [], drinks = [];
    for (const d of days) {
      const xa = ta[d] ?? -1, xb = tb[d] ?? -1;
      let s;
      if (xa === -1 && xb === -1) { const sa = st(a, d), sb = st(b, d); s = (sa === 'dr' || sb === 'dr') ? 'dr' : (sa || sb); }
      else s = xb > xa ? st(b, d) : st(a, d);
      if (xa !== -1 || xb !== -1) t[d] = Math.max(xa, xb);
      if (s === 'af') af.push(d); else if (s === 'dr') drinks.push(d);
    }
    out.af = af.sort(); out.drinks = drinks.sort(); out.t = t;
    return out;
  }

  function mergeStores(a, b) {
    a = a || {}; b = b || {};
    const out = {};
    // settings: whichever device changed them last
    const sSrc = (b.setT || 0) > (a.setT || 0) ? b : a;
    for (const k of ['mode', 'bar', 'sound', 'voice']) out[k] = sSrc[k] !== undefined ? sSrc[k] : (a[k] !== undefined ? a[k] : b[k]);
    out.setT = Math.max(a.setT || 0, b.setT || 0);
    const gSrc = (b.goalsT || 0) > (a.goalsT || 0) ? b : a;
    out.goals = gSrc.goals || a.goals || b.goals;
    out.goalsT = Math.max(a.goalsT || 0, b.goalsT || 0);
    // personal setup (target, dumbbells, alcohol-free on/off)
    const pSrc = (b.profileT || 0) > (a.profileT || 0) ? b : a;
    if (pSrc.profile || a.profile || b.profile) out.profile = pSrc.profile || a.profile || b.profile;
    out.profileT = Math.max(a.profileT || 0, b.profileT || 0);
    if (a.setupDone || b.setupDone) out.setupDone = true;
    // training plan (goals, exercise on/off, session length)
    const plSrc = (b.planT || 0) > (a.planT || 0) ? b : a;
    if (plSrc.plan || a.plan || b.plan) out.plan = plSrc.plan || a.plan || b.plan;
    out.planT = Math.max(a.planT || 0, b.planT || 0);
    // session history: highest count and latest date
    out.history = {};
    for (const k of new Set([...Object.keys(a.history || {}), ...Object.keys(b.history || {})])) {
      const x = (a.history || {})[k] || {}, y = (b.history || {})[k] || {};
      out.history[k] = { count: Math.max(x.count || 0, y.count || 0), last: Math.max(x.last || 0, y.last || 0) };
    }
    // weigh-ins with delete tombstones
    const del = { ...(a.weightsDel || {}) };
    for (const [d, t] of Object.entries(b.weightsDel || {})) del[d] = Math.max(del[d] || 0, t);
    out.weightsDel = del;
    out.weights = byKeyNewest(a.weights, b.weights, e => e.d).filter(e => !(del[e.d] && del[e.d] >= tOf(e)))
      .sort((x, y) => x.d < y.d ? -1 : 1);
    // lifts: one entry per exercise per day
    out.lifts = byKeyNewest(a.lifts, b.lifts, e => e.ex + '|' + e.d);
    // daily counters: one record per day, newest wins
    out.daily = {};
    for (const d of new Set([...Object.keys(a.daily || {}), ...Object.keys(b.daily || {})])) {
      const x = (a.daily || {})[d], y = (b.daily || {})[d];
      if (!x || !y) { out.daily[d] = x || y; continue; }
      // merge each counter/tick separately using its own timestamp
      const tx = x._ts || {}, ty = y._ts || {}, rec = {}, ts = {};
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) {
        if (k === '_t' || k === '_ts') continue;
        const ax = tx[k] ?? x._t ?? 0, ay = ty[k] ?? y._t ?? 0;
        const useY = !(k in x) || ((k in y) && ay > ax);
        rec[k] = useY ? y[k] : x[k]; ts[k] = Math.max(k in x ? ax : 0, k in y ? ay : 0);
      }
      rec._ts = ts; rec._t = Math.max(x._t || 0, y._t || 0);
      out.daily[d] = rec;
    }
    out.af = mergeAF(a.af, b.af);
    return out;
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { mergeStores };
  else root.mergeStores = mergeStores;
})(typeof window !== 'undefined' ? window : globalThis);

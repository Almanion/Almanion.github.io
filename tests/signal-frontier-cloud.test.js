"use strict";
const assert = require("node:assert/strict"),
  {
    CloudSync,
    encode,
  } = require("../game-source/signal-frontier/src/cloud-core"),
  LocalStore = require("../game-source/signal-frontier/src/persistence"),
  E = require("../game-source/signal-frontier/src/engine");
const memory = () => {
  const m = new Map();
  return {
    getItem: (k) => m.get(k) || null,
    setItem: (k, v) => m.set(k, v),
    m,
  };
};
(async () => {
  let db = {},
    offline = false,
    writes = 0;
  const transport = {
    read: async (uid) => {
      if (offline) throw Error("offline");
      return db[uid] || null;
    },
    write: async (uid, revision, save, valid) => {
      if (offline) throw Error("offline");
      if (!valid() || (db[uid]?.revision || 0) !== revision)
        return { committed: false, record: db[uid] };
      db[uid] = {
        version: 1,
        revision: revision + 1,
        save,
        updatedAt: Date.now(),
      };
      writes++;
      return { committed: true, record: db[uid] };
    },
  };
  function client() {
    let state = E.make(),
      fresh = true,
      paused = true;
    const storage = memory();
    const sync = new CloudSync({
      storage,
      transport,
      getSave: () => encode(state),
      validateSave: (t) => assert.ok(E.restore(JSON.parse(t))),
      isFresh: () => fresh,
      canApply: () => paused,
      applySave: (t) => {
        state = JSON.parse(t);
        fresh = false;
      },
    });
    return {
      sync,
      storage,
      get state() {
        return state;
      },
      buy() {
        E.purchase(state, "barracks");
        fresh = false;
      },
      step() {
        E.step(state);
      },
      set paused(v) {
        paused = v;
      },
    };
  }
  const a = client(),
    b = client();
  await a.sync.setUser("one");
  assert.equal(a.sync.status, "synced");
  a.buy();
  await a.sync.sync();
  await b.sync.setUser("one");
  assert.deepEqual(b.state, a.state);
  assert.ok(b.storage.getItem("signal-cloud-backups"));
  a.step();
  b.step();
  b.step();
  await a.sync.sync();
  await b.sync.sync();
  assert.equal(b.sync.status, "conflict");
  const before = writes;
  await b.sync.sync();
  assert.equal(writes, before);
  await b.sync.resolve("cloud");
  assert.deepEqual(b.state, a.state);
  a.step();
  await a.sync.sync();
  b.paused = false;
  await b.sync.sync();
  assert.equal(b.sync.status, "waiting");
  b.paused = true;
  await b.sync.resolve("cloud");
  assert.equal(b.sync.status, "synced");
  offline = true;
  a.step();
  const local = encode(a.state);
  await a.sync.sync();
  assert.equal(a.sync.status, "error");
  assert.equal(encode(a.state), local);
  offline = false;
  await a.sync.sync(true);
  assert.equal(a.sync.status, "synced");
  await a.sync.setUser("two");
  assert.equal(a.sync.status, "account-change");
  assert.equal(db.two, undefined);
  await a.sync.resolve("local");
  assert.equal(a.sync.status, "synced");
  assert.ok(db.two);
  assert.notEqual(db.two, db.one);
  const previous = encode(b.state);
  db.one = {
    ...db.one,
    revision: db.one.revision + 1,
    save: '{"version":999}',
  };
  await b.sync.sync(true);
  assert.equal(b.sync.status, "error");
  assert.equal(encode(b.state), previous);
  const storage = memory(),
    l1 = new LocalStore(storage, "save"),
    l2 = new LocalStore(storage, "save");
  assert.ok(l1.write({ t: 1 }));
  assert.equal(l2.write({ t: 2 }), false);
  assert.equal(storage.getItem("save"), '{"t":1}');
  assert.ok(l2.replace({ t: 2 }));
  assert.ok(storage.getItem("save-backups"));
  assert.equal(l1.write({ t: 3 }), false);
  // A response from a previous account may not apply after sign-out.
  let release;
  const c = client();
  c.sync.o.transport = {
    ...transport,
    read: () => new Promise((r) => (release = r)),
  };
  const inFlight = c.sync.setUser("one");
  await c.sync.setUser(null);
  release({ version: 1, revision: 1, save: local });
  await inFlight;
  assert.equal(c.sync.uid, null);
  assert.equal(c.sync.status, "signed-out");
  assert.equal(c.state.t, 0);
  console.log(
    "PASS cloud: whole operations, conflict, pause, offline retry, account isolation, corruption, stale tabs, late response",
  );
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});

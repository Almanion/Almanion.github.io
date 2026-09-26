const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('matcenter/00-core.js', 'utf8');
const helpers = source.slice(source.indexOf('async function postMatcenterJson'), source.indexOf('async function detectMatcenterAuthMode'));

function context(fetch) {
    const timers = new Map();
    let id = 0;
    const ctx = { fetch, AbortController, DOMException, Math,
        setTimeout(fn, ms) { timers.set(++id, { fn, ms }); return id; },
        clearTimeout(key) { timers.delete(key); } };
    vm.createContext(ctx);
    vm.runInContext(helpers, ctx);
    return { ctx, timers, async tick() {
        // Drain promise continuations before advancing the simulated clock.
        for (let i = 0; i < 15; i++) await Promise.resolve();
        const next = [...timers].sort((a, b) => a[1].ms - b[1].ms)[0];
        if (next) { timers.delete(next[0]); next[1].fn(); }
        for (let i = 0; i < 15; i++) await Promise.resolve();
    } };
}
const response = (status = 200, text = '{"success":true,"tasks":[]}') => ({ ok: status === 200, status, text: async () => text });

async function run() {
    for (const failure of [() => response(503), () => response(429), () => response(200, '<html>gateway</html>'), () => { throw new TypeError('Failed to fetch'); }]) {
        let calls = 0;
        const env = context(async () => ++calls === 1 ? failure() : response());
        const result = env.ctx.readMatcenterTasksJson('main', {});
        await env.tick();
        assert.equal((await result).success, true);
        assert.equal(calls, 2);
        assert.equal(env.timers.size, 0);
    }
    for (const status of [400, 401, 403, 404, 500]) {
        let calls = 0;
        const env = context(async () => { calls++; return response(status); });
        const done = assert.rejects(env.ctx.readMatcenterTasksJson('main', {}), e => e.status === status);
        await env.tick();
        await done;
        assert.equal(calls, status === 500 ? 2 : 1);
    }
    {
        let calls = 0;
        const env = context(async () => { calls++; return response(503); });
        await assert.rejects(env.ctx.postMatcenterJson('main', { action: 'updateStatus' }));
        assert.equal(calls, 1, 'writes must never be retried');
    }
    {
        let calls = 0;
        const env = context(async () => { calls++; return response(200, '{"success":false,"error":"Access denied"}'); });
        assert.equal((await env.ctx.readMatcenterTasksJson('main', {})).success, false);
        assert.equal(calls, 1, 'business errors must not be retried');
    }
    {
        let calls = 0;
        const env = context((_url, { signal }) => {
            calls++;
            return new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
        });
        const done = assert.rejects(env.ctx.readMatcenterTasksJson('main', {}), e => e.code === 'TIMEOUT');
        assert.equal([...env.timers.values()][0].ms, 25000);
        await env.tick(); // first timeout
        await env.tick(); // retry delay
        await env.tick(); // second timeout
        await done;
        assert.equal(calls, 2);
        assert.equal(env.timers.size, 0);
    }
    for (const duringRequest of [true, false]) {
        let calls = 0;
        const controller = new AbortController();
        const env = context((_url, { signal }) => {
            calls++;
            return duringRequest ? new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')))) : Promise.resolve(response(503));
        });
        const done = assert.rejects(env.ctx.readMatcenterTasksJson('main', {}, controller.signal), e => e.name === 'AbortError');
        for (let i = 0; i < 15; i++) await Promise.resolve();
        controller.abort();
        await done;
        assert.equal(calls, 1);
        assert.equal(env.timers.size, 0);
        await assert.rejects(env.ctx.readMatcenterTasksJson('main', {}, controller.signal), e => e.name === 'AbortError');
        assert.equal(calls, 1, 'already cancelled reads must not start');
    }
    console.log('Matcenter request timeout, safe retry and cancellation tests passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });

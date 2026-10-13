/* A watch authenticates as its own anonymous device, never as the phone account.
 * The database grants that device access to bookmarks only, after phone approval. */
(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    else root.AlmanionWatchSync = api;
})(typeof window === 'object' ? window : globalThis, function () {
    'use strict';
    const KEY = 'almanion-watch-connection-v1', TTL = 300000;
    const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
    const stamp = () => ({'.sv':'timestamp'});
    function normalizeCode(value) { return String(value || '').toUpperCase().replace(/[\s-]/g,'').replace(/O/g,'0').replace(/[IL]/g,'1'); }
    function validCode(value) { return /^[0-9A-HJKMNP-TV-Z]{16}$/.test(value); }
    function randomCode(crypto) {
        if (!crypto?.getRandomValues) throw new Error('crypto');
        return Array.from(crypto.getRandomValues(new Uint8Array(16)),value => ALPHABET[value & 31]).join('');
    }
    function message(error) {
        if (error?.code === 'storage') return 'Браузер не разрешает сохранить подключение';
        if (error?.code === 'permission') return 'Подключение недоступно. Проверь правила Firebase';
        if (error?.code === 'expired') return 'Код истёк. Создай новый';
        if (error?.code === 'auth') return 'Не удалось войти. Подключи часы заново';
        return 'Нет сети. Изменения сохранены на часах';
    }
    class Client {
        constructor(options) {
            this.options = options; this.storage = options.storage; this.fetch = options.fetch;
            this.sync = options.sync; this.crypto = options.crypto; this.now = options.now || Date.now;
            this.connection = this.read(); this.state = this.connection.deviceUid ? 'checking' : 'local'; this.listeners = new Set(); this.generation = 0;
            this.guest = options.guestStore || this.makeStore(null); this.store = this.guest;
            if (this.connection.ownerUid) this.activate(this.connection.ownerUid,false);
        }
        read() {
            try { const value = JSON.parse(this.storage.getItem(KEY) || '{}'); return value && typeof value === 'object' ? value : {}; } catch (_) { return {}; }
        }
        persist() {
            try { this.storage.setItem(KEY,JSON.stringify(this.connection)); }
            catch (_) { throw Object.assign(new Error('Storage unavailable'),{code:'storage'}); }
        }
        emit(state) { this.state = state; this.options.onStatus?.(this.status()); }
        status() {
            const request = this.connection.request;
            return {state:this.state,linked:!!this.connection.ownerUid,code:request?.code || '',expiresAt:request?.createdAt ? request.createdAt + TTL : 0,pending:this.store?.pending().length || 0};
        }
        makeStore(ownerUid) {
            return this.sync.createCollection({namespace:'bookmarks',owner:ownerUid ? 'watch:'+ownerUid : 'guest',storageKey:ownerUid ? 'almanion_watch_bookmarks_'+ownerUid : 'almanion_bookmarks_guest',onChange:(records,detail) => {
                if (detail.type === 'error') { this.syncError=detail.error || new Error('Sync failed');this.emit(detail.error?.code==='permission' ? 'unavailable' : 'offline'); }
                else if (this.connection.ownerUid) this.emit(this.store?.pending().length ? 'pending' : 'synced');
                this.options.onChange?.(records,detail);
            }});
        }
        activate(ownerUid,migrate) {
            if (this.ownerUid === ownerUid) return;
            this.store?.disconnect(); this.ownerUid = ownerUid;
            this.store = ownerUid ? this.makeStore(ownerUid) : this.guest;
            if (ownerUid && migrate) {
                // Merge guest favorites once, not stale guest deletions on every reconnect.
                const records = this.guest.snapshot();
                const imported={};
                for (const [id,record] of Object.entries(records)) if (!record.noteOnly) imported[id]={...record,__sync:{...record.__sync,pending:true}};
                this.store.merge(imported);
            }
            this.options.onStore?.(this.store);
        }
        async auth(force) {
            if (!force && this.connection.idToken && this.connection.expiresAt > this.now()+60000) return this.connection.idToken;
            if (this.authPromise) return this.authPromise;
            this.authPromise = (async () => {
                const refresh = this.connection.refreshToken;
                const url = refresh ? 'https://securetoken.googleapis.com/v1/token' : 'https://identitytoolkit.googleapis.com/v1/accounts:signUp';
                const body = refresh ? new URLSearchParams({grant_type:'refresh_token',refresh_token:refresh}).toString() : JSON.stringify({returnSecureToken:true});
                const response = await this.send(url+'?key='+encodeURIComponent(this.options.config.apiKey),{method:'POST',headers:{'Content-Type':refresh ? 'application/x-www-form-urlencoded' : 'application/json'},body});
                if (!response.ok) throw Object.assign(new Error('Device authentication failed'),{code:'auth'});
                const value = await response.json(), uid = value.user_id || value.localId;
                if (!uid || (this.connection.deviceUid && uid !== this.connection.deviceUid)) throw Object.assign(new Error('Different device'),{code:'auth'});
                Object.assign(this.connection,{deviceUid:uid,idToken:value.id_token || value.idToken,refreshToken:value.refresh_token || value.refreshToken,expiresAt:this.now()+Number(value.expires_in || value.expiresIn || 3600)*1000});
                this.persist(); return this.connection.idToken;
            })().finally(()=>{this.authPromise=null;});
            return this.authPromise;
        }
        async send(url,options) {
            const controller = new AbortController(), timer = setTimeout(()=>controller.abort(),10000);
            try { return await this.fetch(url,{...options,signal:controller.signal,cache:'no-store',referrerPolicy:'no-referrer'}); }
            finally { clearTimeout(timer); }
        }
        async request(path,options={},retried=false) {
            const token = await this.auth(retried), url = new URL(path+'.json',this.options.config.databaseURL);
            url.searchParams.set('auth',token);
            const response = await this.send(url.href,options);
            if (response.status === 401 && !retried) return this.request(path,options,true);
            if (response.status === 401 || response.status === 403) throw Object.assign(new Error('Permission denied'),{code:'permission'});
            if (!response.ok && response.status !== 412) throw new Error('Network request failed');
            return response;
        }
        async get(path) { return (await this.request(path)).json(); }
        async begin() {
            if (this.connection.ownerUid) return this.status();
            await this.auth();
            const old = this.connection.request;
            if (old?.code) { try { await this.request('watchPairRequests/'+old.code,{method:'DELETE'}); } catch (_) {} }
            const code = randomCode(this.crypto);
            this.connection.request = {code}; this.persist();
            const value = {deviceUid:this.connection.deviceUid,name:'Часы',createdAt:stamp()};
            const response = await this.request('watchPairRequests/'+code,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(value)});
            const saved = await response.json();
            this.connection.request.createdAt = saved.createdAt;
            this.clockOffset = saved.createdAt-this.now(); this.persist(); this.emit('waiting'); this.schedule(0); return this.status();
        }
        async checkGrant() {
            const grant = await this.get('watchDevices/'+this.connection.deviceUid);
            if (grant?.ownerUid) {
                if (this.connection.ownerUid && grant.ownerUid !== this.connection.ownerUid) this.activate(null,false);
                const migrate = !this.connection.ownerUid;
                this.connection.ownerUid = grant.ownerUid; delete this.connection.request; this.persist();
                this.activate(grant.ownerUid,migrate);
                return true;
            }
            if (this.connection.ownerUid) {
                delete this.connection.ownerUid; this.persist(); this.activate(null,false); this.listeners.clear(); this.emit('revoked');
                return false;
            }
            const pending = this.connection.request;
            if (pending?.createdAt && pending.createdAt+TTL <= this.now()+(this.clockOffset || 0)) {
                try { await this.request('watchPairRequests/'+pending.code,{method:'DELETE'}); } catch (_) {}
                delete this.connection.request; this.persist(); this.emit('expired');
            } else if (pending) this.emit('waiting');
            return false;
        }
        ref(path) {
            const client = this;
            return {
                child(id) { return client.ref(path+'/'+encodeURIComponent(id)); },
                async once() { const value=await client.get(path);return {val:()=>value}; },
                on(_,handler,error) { client.listeners.add({path,handler,error}); },
                off(_,handler) { for (const entry of client.listeners) if (entry.path === path && entry.handler === handler) client.listeners.delete(entry); },
                async update(values) { await client.request(path,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(values)}); },
                async transaction(change) {
                    for (let attempt=0;attempt<5;attempt++) {
                        const response=await client.request(path,{headers:{'X-Firebase-ETag':'true'}});
                        const current=await response.json(), next=change(current);
                        if (next === undefined) return {committed:false,snapshot:{val:()=>current}};
                        const etag=response.headers.get('etag');
                        if(!etag) throw new Error('Missing concurrency token');
                        const saved=await client.request(path,{method:'PUT',headers:{'Content-Type':'application/json','If-Match':etag},body:JSON.stringify(next)});
                        if (saved.status === 412) continue;
                        const value=await saved.json();return {committed:true,snapshot:{val:()=>value}};
                    }
                    throw new Error('Concurrent changes; retry later');
                }
            };
        }
        async tick() {
            clearTimeout(this.timer);
            if (this.busy) { this.rerun=true;return; }
            if (this.stopped || this.options.visible?.() === false || !this.connection.deviceUid) return;
            this.busy = true; const generation=this.generation;
            try {
                if (await this.checkGrant()) {
                    if (generation !== this.generation) return;
                    this.syncError=null;
                    const path='bookmarks/'+this.connection.ownerUid;
                    if (!this.store.ref) await this.store.connect(this.ref(path));
                    else for (const listener of [...this.listeners]) {
                        try { const value=await this.get(listener.path);if(generation===this.generation) listener.handler({val:()=>value}); }
                        catch(error){listener.error?.(error);throw error;}
                    }
                    if (!await this.store.flush() || this.syncError) throw this.syncError || new Error('Sync failed');
                    if (generation===this.generation) this.emit(this.store.pending().length ? 'pending' : 'synced');
                }
            } catch (error) { if(generation===this.generation) this.emit(['permission','auth'].includes(error.code) ? 'unavailable' : 'offline'); }
            finally { this.busy=false;const delay=this.rerun ? 0 : this.connection.request ? 2000 : 20000;this.rerun=false;if(!this.stopped && (this.connection.ownerUid || this.connection.request)) this.schedule(delay); }
        }
        schedule(delay) { clearTimeout(this.timer);if(!this.stopped && this.options.visible?.()!==false) this.timer=setTimeout(()=>this.tick(),delay); }
        start() { this.stopped=false;if(this.connection.deviceUid) this.schedule(0); }
        stop() { this.stopped=true;clearTimeout(this.timer);this.store?.disconnect();this.generation++; }
        async unlink() {
            // Do not claim remote revocation succeeded when the watch is offline.
            if (this.connection.deviceUid) await this.request('watchDevices/'+this.connection.deviceUid,{method:'DELETE'});
            this.generation++; this.store?.disconnect();this.listeners.clear();
            delete this.connection.ownerUid; delete this.connection.request; this.persist();this.activate(null,false);this.emit('local');
        }
    }
    return {Client,KEY,TTL,stamp,normalizeCode,validCode,randomCode,message};
});

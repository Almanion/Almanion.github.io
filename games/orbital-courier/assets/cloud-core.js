/* Whole-save synchronization. Currency, receipts and upgrades are never merged. */
(function(root){
  'use strict';
  const O=root.Orbital=root.Orbital||{};
  function canonical(value){
    if(Array.isArray(value))return value.map(canonical);
    if(value&&typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
    return value;
  }
  const encode=p=>JSON.stringify(canonical(p));
  class CloudSync {
    constructor(options){this.o=options;this.uid=null;this.epoch=0;this.status='off';this.remote=null;this.base=null;this.revision=0;this.busy=false;this.again=false;}
    notify(status){this.status=status;this.o.changed?.(this);}
    readMeta(){try{return JSON.parse(this.o.storage.getItem('orbital-cloud-meta:'+this.uid)||'null');}catch{return null;}}
    owner(){try{return this.o.storage.getItem('orbital-cloud-owner');}catch{return null;}}
    remember(record){
      // Persist ownership before authorizing future automatic writes.
      this.o.storage.setItem('orbital-cloud-meta:'+this.uid,JSON.stringify({base:record.save,revision:record.revision}));
      this.o.storage.setItem('orbital-cloud-owner',this.uid);
      this.base=record.save;this.revision=record.revision;this.remote=record;this.attached=true;
    }
    backup(remote){
      const key='orbital-cloud-backups',old=JSON.parse(this.o.storage.getItem(key)||'[]');
      old.push({at:Date.now(),uid:this.uid,local:this.o.getSave(),cloud:remote?.save||null});
      this.o.storage.setItem(key,JSON.stringify(old.slice(-3)));
    }
    async setUser(uid){
      this.epoch++;this.uid=uid;this.remote=null;this.base=null;this.revision=0;this.again=false;
      if(!uid){this.notify('signed-out');return;}
      const owner=this.owner(),meta=this.readMeta();this.attached=!owner||owner===uid;
      if(owner===uid&&meta){this.base=meta.base;this.revision=meta.revision;}
      this.notify('connecting');await this.sync();
    }
    async sync(force=false){
      if(!this.uid)return;
      if(!force&&['conflict','account-change','error'].includes(this.status))return;
      if(this.busy){this.again=true;return;}
      const epoch=this.epoch,uid=this.uid;this.busy=true;
      const valid=()=>this.epoch===epoch&&this.uid===uid;
      try{
        this.notify('syncing');
        const remote=await this.o.transport.read(uid);if(!valid())return;
        if(remote)this.validate(remote);
        this.remote=remote;
        if(!this.attached){this.notify('account-change');return;}
        const local=this.o.getSave();
        if(remote?.save===local){this.remember(remote);this.notify('synced');return;}
        if(remote && (local===this.base || (!this.base&&this.o.isFresh()))){
          if(!this.o.canApply()){this.notify('waiting');return;}
          this.backup(remote);this.o.applySave(remote.save);this.remember(remote);this.notify('synced');return;
        }
        const unchanged=remote ? remote.revision===this.revision&&remote.save===this.base : this.base===null;
        if(!unchanged){this.notify('conflict');return;}
        await this.push(local,remote,valid);
      }catch(e){if(valid()){this.error=e;this.notify('error');}}
      finally{
        this.busy=false;
        if(this.again){this.again=false;queueMicrotask(()=>this.sync());}
      }
    }
    validate(record){
      if(record.version!==1||!Number.isSafeInteger(record.revision)||record.revision<1||typeof record.save!=='string'||record.save.length>2000000)throw Error('Некорректное облачное сохранение.');
      this.o.validateSave(record.save);
    }
    async push(local,remote,valid){
      const result=await this.o.transport.write(this.uid,remote?.revision||0,local,valid);
      if(!valid())return;
      if(!result.committed){
        if(result.record)this.validate(result.record);
        this.remote=result.record;this.notify('conflict');return;
      }
      this.remember(result.record);
      if(this.o.getSave()!==local){this.again=true;this.notify('pending');}else this.notify('synced');
    }
    async resolve(choice){
      if(this.busy||!this.uid||!['conflict','account-change','waiting'].includes(this.status))return;
      if(!this.o.canApply()){this.notify('waiting');return;}
      const epoch=this.epoch,uid=this.uid,valid=()=>this.epoch===epoch&&this.uid===uid;
      this.busy=true;
      try{
        // The displayed comparison is a snapshot; do not overwrite a newer one.
        const current=await this.o.transport.read(uid);if(!valid())return;
        if(current)this.validate(current);
        if((current?.revision||0)!==(this.remote?.revision||0)||current?.save!==this.remote?.save){this.remote=current;this.notify('conflict');return;}
        this.backup(current);
        if(choice==='cloud'&&current){this.o.applySave(current.save);this.remember(current);this.notify('synced');}
        else if(choice==='local')await this.push(this.o.getSave(),current,valid);
      }catch(e){if(valid()){this.error=e;this.notify('error');}}
      finally{this.busy=false;if(this.again){this.again=false;queueMicrotask(()=>this.sync());}}
    }
  }
  O.CloudCore={CloudSync,encode};
  if(typeof module!=='undefined'&&module.exports)module.exports=O.CloudCore;
})(typeof globalThis!=='undefined'?globalThis:window);

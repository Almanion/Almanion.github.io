/* Optional game-only adapter. Uses the same Almanion account without loading
   the site's unrelated progress and analytics modules. */
(function(root){
    'use strict';
    function timeout(promise,ms,message,onTimeout=()=>{}){
        let timer;
        return Promise.race([promise,new Promise((_,reject)=>{timer=setTimeout(()=>{onTimeout();reject(Error(message));},ms);})]).finally(()=>clearTimeout(timer));
    }
    function script(url){return new Promise((resolve,reject)=>{
        const s=document.createElement('script');let timer;
        const fail=()=>{clearTimeout(timer);s.remove();reject(Error('Не удалось загрузить вход. Проверь интернет и повтори.'));};
        s.src=url;s.onload=()=>{clearTimeout(timer);resolve();};s.onerror=fail;timer=setTimeout(fail,15000);document.head.appendChild(s);
    });}
    let ready,session,persistence='local';
    function initialize(){
        if(!ready)ready=(async()=>{
                if(!root.firebase?.apps)await script('https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js');
                if(!root.firebase.auth)await script('https://www.gstatic.com/firebasejs/12.18.0/firebase-auth-compat.js');
                if(!root.firebase.database)await script('https://www.gstatic.com/firebasejs/12.18.0/firebase-database-compat.js');
                if(typeof firebaseConfig==='undefined')await script('/firebase-config.js');
                if(!firebase.apps.length)firebase.initializeApp(firebaseConfig);
                const auth=firebase.auth();auth.useDeviceLanguage();
                await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(()=>{
                    persistence='session';return auth.setPersistence(firebase.auth.Auth.Persistence.SESSION);
                }).catch(()=>{
                    persistence='memory';return auth.setPersistence(firebase.auth.Auth.Persistence.NONE);
                });
                session={auth,db:firebase.database()};return session;
            })().catch(e=>{ready=null;session=null;throw e;});
        return ready;
    }
    root.AlmanionOrbitalAccount={
        get persistence(){return persistence;},
        async connect(onUser){
            const {auth,db}=await initialize(),connected=db.ref('.info/connected');let online=false;
            const connection=s=>{online=s.val()===true;};connected.on('value',connection);
            const ref=uid=>db.ref('gameProgress/'+uid+'/orbitalCourier');
            const current=uid=>auth.currentUser?.uid===uid&&!auth.currentUser.isAnonymous;
            const transport={
                async read(uid){
                    if(!current(uid))throw Error('Войди в свой аккаунт Almanion.');
                    // Disconnected Firebase listeners can otherwise wait indefinitely.
                    if(!online)await new Promise((resolve,reject)=>{
                        const timer=setTimeout(()=>{connected.off('value',listen);reject(Error('Нет соединения. Прогресс остаётся на устройстве.'));},8000);
                        function listen(s){if(s.val()===true){clearTimeout(timer);connected.off('value',listen);resolve();}}
                        connected.on('value',listen);
                    });
                    if(!current(uid))throw Error('Аккаунт изменился.');
                    return (await timeout(ref(uid).once('value'),12000,'Облако не ответило. Повторим сохранение автоматически.')).val();
                },
                async write(uid,revision,save,valid){
                    if(!online)throw Error('Нет соединения. Прогресс остаётся на устройстве.');
                    let active=true;
                    const request=ref(uid).transaction(record=>{
                        if(!active||!valid()||!current(uid))return;
                        // Firebase can first supply null from an empty local cache.
                        // Let its server-side compare-and-swap fetch the actual value;
                        // the retried callback still rejects a different revision.
                        if(record!=null&&record.revision!==revision)return;
                        return {version:1,revision:revision+1,save,updatedAt:firebase.database.ServerValue.TIMESTAMP};
                    },undefined,false);
                    try{
                        const result=await timeout(request,12000,'Не получено подтверждение облака. Прогресс сохранён на устройстве.',()=>{active=false;});
                        return {committed:result.committed,record:result.snapshot.val()};
                    }finally{active=false;}
                }
            };
            const unsubscribe=auth.onAuthStateChanged(user=>onUser(user&&!user.isAnonymous?user:null,transport),error=>onUser(null,transport,error));
            return ()=>{unsubscribe();connected.off('value',connection);};
        },
        async signIn(email,password){return (await initialize()).auth.signInWithEmailAndPassword(email,password);},
        async register(email,password){return (await initialize()).auth.createUserWithEmailAndPassword(email,password);},
        async resetPassword(email){
            try{await (await initialize()).auth.sendPasswordResetEmail(email);}
            catch(error){if(!['auth/user-not-found','auth/user-disabled'].includes(error.code))throw error;}
        },
        signInGoogle(){
            // Connect finishes before this button is enabled; keep popup creation in the click.
            if(!session)return Promise.reject(Error('Дождись подключения и повтори вход.'));
            const provider=new firebase.auth.GoogleAuthProvider();provider.setCustomParameters({prompt:'select_account'});
            return session.auth.signInWithPopup(provider);
        },
        async signOut(){return (await initialize()).auth.signOut();}
    };
})(window);

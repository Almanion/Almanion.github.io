/* Optional Almanion account adapter. Loaded only after enabling cloud saves. */
(function(root){
    'use strict';
    function script(url){return new Promise((resolve,reject)=>{
        const s=document.createElement('script');s.src=url;s.onload=resolve;
        s.onerror=()=>{s.remove();reject(Error('Не удалось загрузить вход в аккаунт. Проверь интернет.'));};
        document.head.appendChild(s);
    });}
    let ready;
    root.AlmanionOrbitalAccount={
        async connect(onUser){
            if(!ready)ready=(async()=>{
                if(!root.firebase?.apps)await script('https://www.gstatic.com/firebasejs/12.18.0/firebase-app-compat.js');
                if(!root.firebase.auth)await script('https://www.gstatic.com/firebasejs/12.18.0/firebase-auth-compat.js');
                if(!root.firebase.database)await script('https://www.gstatic.com/firebasejs/12.18.0/firebase-database-compat.js');
                if(typeof firebaseConfig==='undefined')await script('/firebase-config.js');
                if(!firebase.apps.length)firebase.initializeApp(firebaseConfig);
                return {auth:firebase.auth(),db:firebase.database()};
            })().catch(e=>{ready=null;throw e;});
            const {auth,db}=await ready;
            const connected=db.ref('.info/connected');let online=false;
            const connection=s=>{online=s.val()===true;};connected.on('value',connection);
            const ref=uid=>db.ref('gameProgress/'+uid+'/orbitalCourier');
            const transport={
                async read(uid){
                    // Offline transactions can remain queued indefinitely. Never start one offline.
                    if(!online)await new Promise((resolve,reject)=>{
                        const timer=setTimeout(()=>{connected.off('value',listen);reject(Error('Нет соединения. Прогресс остаётся на устройстве.'));},8000);
                        function listen(s){if(s.val()===true){clearTimeout(timer);connected.off('value',listen);resolve();}}
                        connected.on('value',listen);
                    });
                    if(auth.currentUser?.uid!==uid||auth.currentUser.isAnonymous)throw Error('Войди в свой аккаунт Almanion.');
                    return (await ref(uid).once('value')).val();
                },
                async write(uid,revision,save,valid){
                    if(!online)throw Error('Нет соединения. Прогресс остаётся на устройстве.');
                    const result=await ref(uid).transaction(current=>{
                        if(!valid()||auth.currentUser?.uid!==uid||auth.currentUser.isAnonymous)return;
                        if((current?.revision||0)!==revision)return;
                        return {version:1,revision:revision+1,save,updatedAt:firebase.database.ServerValue.TIMESTAMP};
                    },undefined,false);
                    return {committed:result.committed,record:result.snapshot.val()};
                }
            };
            const unsubscribe=auth.onAuthStateChanged(user=>onUser(user&&!user.isAnonymous?user:null,transport));
            return ()=>{unsubscribe();connected.off('value',connection);};
        }
    };
})(window);

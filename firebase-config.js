// ============================================
// FIREBASE КОНФИГУРАЦИЯ
// ============================================
// Актуальные правила Realtime Database лежат в firebase/database.rules.json.
// Их нужно публиковать через Firebase Console: комментарий в клиентском файле
// сам по себе не является границей безопасности.

// Import the functions you need from the SDKs you need
// ============================================

const firebaseConfig = {
    apiKey: "AIzaSyD7pwdKZZJapEdD60TS_z_UFD9IijB_UYU",
    authDomain: "almanion-70120.firebaseapp.com",
    projectId: "almanion-70120",
    databaseURL: "https://almanion-70120-default-rtdb.europe-west1.firebasedatabase.app/",
    storageBucket: "almanion-70120.firebasestorage.app",
    messagingSenderId: "441119263666",
    appId: "1:441119263666:web:349dbcd80215e54e6cf2ab"
  };

// Публичный OAuth Client ID веб-приложения из того же Firebase-проекта.
// Google Identity Services возвращает ID token, который затем обменивается
// на обычную Firebase-сессию: UID и все привязанные данные остаются прежними.
const googleIdentityClientId = "441119263666-00h09k5bhpc17ql399mmmj0rk3bv3fl7.apps.googleusercontent.com";

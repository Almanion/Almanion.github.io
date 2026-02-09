// ============================================
// FIREBASE КОНФИГУРАЦИЯ
// ============================================
// 
// ИНСТРУКЦИЯ ПО НАСТРОЙКЕ:
// 1. Зайди на https://console.firebase.google.com/
// 2. Создай новый проект (например "almanion-analytics")
// 3. В разделе "Build" включи:
//    - Authentication → Email/Password
//    - Realtime Database → создай базу (правила — см. ниже)
//    - Firestore Database → создай базу (правила — см. ниже)
// 4. В настройках проекта (шестерёнка) → "Ваши приложения" → добавь веб-приложение
// 5. Скопируй конфиг сюда
// 6. В Authentication → добавь свой email как пользователя
//
// ПРАВИЛА REALTIME DATABASE:
// {
//   "rules": {
//     "presence": {
//       ".read": true,
//       "$uid": {
//         ".write": true
//       }
//     },
//     "polls": {
//       ".read": true,
//       ".write": "auth != null"
//     },
//     "pollResponses": {
//       ".read": true,
//       "$pollId": {
//         "$visitorId": {
//           ".write": true
//         }
//       }
//     },
//     "visitors": {
//       ".read": "auth != null",
//       ".write": true
//     },
//     "dailyStats": {
//       ".read": "auth != null",
//       ".write": true
//     },
//     "visitorNames": {
//       ".read": "auth != null",
//       ".write": "auth != null"
//     },
//     "directMessages": {
//       ".read": true,
//       ".write": "auth != null",
//       "$visitorId": {
//         "$msgId": {
//           "read": { ".write": true },
//           "readAt": { ".write": true }
//         }
//       }
//     }
//   }
// }
//
// ПРАВИЛА FIRESTORE:
// Не используется в этой версии (всё через Realtime Database)

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
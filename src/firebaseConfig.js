// src/firebaseConfig.js
// 注意：这里使用 import.meta.env.VITE_ 开头的环境变量，这是 Vite 的标准做法。
// 这些变量的值将在 Vercel 部署时通过其配置界面注入。

export const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// 用于 Firestore 路径的自定义应用标识符 (请确保与您的 Firestore 安全规则中的路径一致)
export const APP_IDENTIFIER = "my-todo-list-v1";
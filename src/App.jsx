import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    signInAnonymously, 
    signInWithCustomToken, 
    onAuthStateChanged 
} from 'firebase/auth';
import { 
    getFirestore, 
    collection, 
    query, 
    where, 
    onSnapshot, 
    doc, 
    setDoc, 
    addDoc, 
    deleteDoc,
    orderBy
} from 'firebase/firestore';
import { Plus, X, Check, Trash2, LayoutGrid, Loader2, Zap, User, Sparkles, XCircle } from 'lucide-react';

// --- 1. Global Configuration and Firebase Setup ---
const APP_ID = typeof __app_id !== 'undefined' ? __app_id : 'default-todo-app';
let FIREBASE_CONFIG = {};
let INITIAL_AUTH_TOKEN = null;
let CONFIG_ERROR_MESSAGE = '';

try {
    if (typeof __firebase_config === 'string' && __firebase_config.trim().length > 0) {
        FIREBASE_CONFIG = JSON.parse(__firebase_config);
    }
    INITIAL_AUTH_TOKEN = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

    // **关键检查**: 严格验证配置中是否包含 Firebase 初始化所需的关键字段
    if (!FIREBASE_CONFIG || !FIREBASE_CONFIG.apiKey || !FIREBASE_CONFIG.projectId) {
        CONFIG_ERROR_MESSAGE = "致命错误：

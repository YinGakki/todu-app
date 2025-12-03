import React, { useState, useEffect, useCallback, useRef } from 'react';
import { initializeApp } from 'firebase/app';
// ... (其他导入) ...
import { Plus, X, Check, Trash2, LayoutGrid, Loader2, Zap, User, Sparkles, XCircle } from 'lucide-react';

// --- 1. Global Configuration and Firebase Setup ---
const APP_ID = typeof __app_id !== 'undefined' ? __app_id : 'default-todo-app';
let FIREBASE_CONFIG = {};
let INITIAL_AUTH_TOKEN = null;
let CONFIG_ERROR_MESSAGE = '';
let CONFIG_SOURCE_INFO = '未开始配置检查'; 

INITIAL_AUTH_TOKEN = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// 用于记录尝试的来源
const attemptedSources = [];

// --- 尝试方法 1 (首选): 读取独立的全局变量 ---
// W 尝试指向全局的 window 对象，以访问环境变量
const W = typeof window !== 'undefined' ? window : {}; 
    
// 关键变量检查！同时检查 VITE_ 前缀和非 VITE_ 前缀的名称
const API_KEY = W.VITE_FIREBASE_API_KEY || W.FIREBASE_API_KEY || '';
const PROJECT_ID = W.VITE_FIREBASE_PROJECT_ID || W.FIREBASE_PROJECT_ID || '';

attemptedSources.push('独立全局变量');

if (API_KEY && PROJECT_ID) {
    FIREBASE_CONFIG = {
        apiKey: API_KEY,
        // 其他可选字段，如 authDomain 等，也使用相同的命名模式
        projectId: PROJECT_ID,
        // ...
    };
    CONFIG_SOURCE_INFO = '独立全局变量';
}

// --- 尝试方法 2 (备选): 聚合的 JSON 字符串 (__firebase_config) ---
if (!FIREBASE_CONFIG.apiKey || !FIREBASE_CONFIG.projectId) {
    attemptedSources.push('聚合 JSON 字符串 (__firebase_config)');
    try {
        // 关键变量检查！
        const configString = typeof __firebase_config !== 'undefined' ? __firebase_config : '';
        if (configString.trim().length > 0) {
            const parsedConfig = JSON.parse(configString);
            if (parsedConfig.apiKey && parsedConfig.projectId) {
                FIREBASE_CONFIG = parsedConfig;
                CONFIG_SOURCE_INFO = '聚合 JSON 字符串';
            }
        }
    } catch (e) {
        // ...
    }
}
// ... (应用的其余部分) ...

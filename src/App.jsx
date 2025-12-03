// src/App.jsx - 任务提醒应用核心代码
import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    signInAnonymously, 
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
import { Plus, X, Check, Trash2, LayoutGrid } from 'lucide-react';
import { firebaseConfig, APP_IDENTIFIER } from './firebaseConfig'; // 导入配置

// --- 1. Firebase 初始化与全局配置 ---
const FIREBASE_CONFIG = firebaseConfig;
const APP_ID = APP_IDENTIFIER;
// 外部环境使用匿名登录，不使用自定义 token
const INITIAL_AUTH_TOKEN = null; 

// 使用私有路径存储任务
const getTasksCollectionRef = (db, userId) => {
    // 路径示例: my-todo-list-v1/users/{userId}/tasks
    return collection(db, `${APP_ID}/users/${userId}/tasks`);
};

// 预定义任务组
const defaultGroups = ['个人', '工作', '家庭'];

// --- 2. 核心组件：任务模态窗口 ---
const TaskModal = ({ isOpen, onClose, currentGroup, addTask }) => {
    const [title, setTitle] = useState('');
    const [importance, setImportance] = useState('普通');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (title.trim()) {
            addTask(title.trim(), importance);
            setTitle('');
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6 animate-fade-in-up">
                <div className="flex justify-between items-center mb-4">
                    <h2 className="text-xl font-bold text-gray-800">新增任务到「{currentGroup}」</h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100 transition">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>
                
                <form onSubmit={handleSubmit}>
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-1">任务标题</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="输入任务描述"
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition"
                            required
                        />
                    </div>
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-1">重要程度</label>
                        <select
                            value={importance}
                            onChange={(e) => setImportance(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-lg bg-white focus:ring-blue-500 focus:border-blue-500 transition"
                        >
                            <option value="高">高</option>
                            <option value="普通">普通</option>
                        </select>
                    </div>
                    
                    <button
                        type="submit"
                        className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg shadow-md hover:bg-blue-700 transition duration-150"
                    >
                        添加任务
                    </button>
                </form>
            </div>
        </div>
    );
};


// --- 3. 核心组件：任务列表项 ---
const TaskItem = ({ task, updateTask, deleteTask }) => {
    const importanceColor = task.importance === '高' ? 'border-red-500' : 'border-blue-500';
    const bgColor = task.is_done ? 'bg-gray-100 opacity-70 line-through' : 'bg-white hover:shadow-lg';
    const titleColor = task.is_done ? 'text-gray-500' : 'text-gray-800';

    return (
        <li 
            className={`flex items-center justify-between p-4 mb-3 rounded-xl shadow transition duration-200 ease-in-out border-l-4 ${importanceColor} ${bgColor}`}
        >
            <div className="flex-1 min-w-0">
                <p className={`text-lg font-semibold truncate ${titleColor}`}>{task.title}</p>
                <p className="text-sm text-gray-400 mt-1">
                    重要性: <span className={task.importance === '高' ? 'text-red-500 font-medium' : 'text-blue-500'}>{task.importance}</span>
                </p>
            </div>

            <div className="flex space-x-2 ml-4">
                {!task.is_done && (
                    <button
                        onClick={() => updateTask(task.id, { is_done: true })}
                        className="p-2 text-white bg-green-500 rounded-full shadow-md hover:bg-green-600 transition"
                        title="标记完成"
                    >
                        <Check className="w-5 h-5" />
                    </button>
                )}
                <button
                    onClick={() => deleteTask(task.id)}
                    className="p-2 text-white bg-red-500 rounded-full shadow-md hover:bg-red-600 transition"
                    title="删除任务"
                >
                    <Trash2 className="w-5 h-5" />
                </button>
            </div>
        </li>
    );
};


// --- 4. 主应用组件 ---
const App = () => {
    const [db, setDb] = useState(null);
    const [userId, setUserId] = useState(null);
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isAuthReady, setIsAuthReady] = useState(false);
    
    // 任务组状态
    const [currentGroup, setCurrentGroup] = useState(defaultGroups[0]);
    const [isModalOpen, setIsModalOpen] = useState(false);

    // --- Firebase Auth & Init ---
    useEffect(() => {
        try {
            // 检查 Firebase 配置是否完整
            if (!FIREBASE_CONFIG.apiKey) {
                setError("错误: Firebase 配置未找到。请设置 Vercel 环境变量。");
                setIsAuthReady(true);
                return;
            }

            const app = initializeApp(FIREBASE_CONFIG);
            const firestoreDb = getFirestore(app);
            const auth = getAuth(app);
            setDb(firestoreDb);

            // 1. 认证流程：使用匿名登录
            const handleAuth = async () => {
                try {
                    // 外部环境通常使用匿名登录，不需要 custom token
                    const userCredential = await signInAnonymously(auth);
                    setUserId(userCredential.user.uid);
                } catch (e) {
                    console.error("Firebase Auth Error:", e);
                    setError("认证失败。请检查 Firebase 配置。");
                } finally {
                    setIsAuthReady(true);
                }
            };

            // 2. 监听 Auth 状态变化
            const unsubscribeAuth
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
        let unsubscribeAuth = null; // 修正点 1: 声明为 let 且初始化为 null

        // 检查配置
        if (!FIREBASE_CONFIG.apiKey) {
            setError("错误: Firebase 配置未找到。请设置 Vercel 环境变量。");
            setIsAuthReady(true);
            return; 
        }

        try {
            const app = initializeApp(FIREBASE_CONFIG);
            const firestoreDb = getFirestore(app);
            const auth = getAuth(app);
            setDb(firestoreDb);

            // 1. 认证流程：使用匿名登录
            const handleAuth = async () => {
                try {
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
            unsubscribeAuth = onAuthStateChanged(auth, (user) => {
                if (user) {
                    setUserId(user.uid);
                    setIsAuthReady(true); // 确保在成功登录后标记为就绪
                } else if (!userId) {
                    // 如果用户未登录，并且我们还没有 userId，尝试匿名登录
                    handleAuth();
                }
            });

            // 修正点 2: 只有在成功执行到这里时，才返回清理函数
            return () => {
                if (unsubscribeAuth) {
                    unsubscribeAuth();
                }
            };
            
        } catch (e) {
            console.error("Firebase Initialization Error:", e);
            setError("Firebase 初始化失败。");
            setIsAuthReady(true); // 即使失败也要标记为就绪，以解除加载状态
        }

        // 如果在 try/catch 之外，意味着初始化失败或提前退出，无需额外清理。
    }, []);


    // --- Firestore Realtime Listener ---
    useEffect(() => {
        // 只有当 DB, UserId 和 AuthReady 后才能开始监听数据
        if (!db || !userId || !isAuthReady) {
            return;
        }

        setLoading(true);
        setError('');
        
        try {
            const tasksRef = getTasksCollectionRef(db, userId);
            
            // 查询：过滤当前组，并按是否完成和创建时间排序 
            const q = query(
                tasksRef, 
                where('groupId', '==', currentGroup),
                orderBy('is_done'),
                orderBy('createdAt', 'desc') // 使用 createdAt 进行排序
            );

            // 实时监听器
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const fetchedTasks = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setTasks(fetchedTasks);
                setLoading(false);
            }, (err) => {
                console.error("Firestore Listen Error:", err);
                setError("实时数据同步失败。请检查 Firestore 规则。");
                setLoading(false);
            });

            // 清理函数
            return () => unsubscribe();
            
        } catch (e) {
            console.error("Firestore Query Setup Error:", e);
            setError("查询设置错误。");
            setLoading(false);
        }
    }, [db, userId, isAuthReady, currentGroup]);


    // --- Firestore 操作函数 ---

    const addTask = useCallback(async (title, importance) => {
        if (!db || !userId) return;
        try {
            await addDoc(getTasksCollectionRef(db, userId), {
                title,
                importance,
                is_done: false,
                groupId: currentGroup, 
                userId: userId, 
                createdAt: new Date().getTime() // 使用时间戳进行排序
            });
        } catch (e) {
            console.error("Error adding task:", e);
            setError("添加任务失败。");
        }
    }, [db, userId, currentGroup]);

    const updateTask = useCallback(async (taskId, updates) => {
        if (!db || !userId) return;
        try {
            const taskDocRef = doc(getTasksCollectionRef(db, userId), taskId);
            // setDoc 替换了 setDoc(..., { merge: true })，效果相同
            await setDoc(taskDocRef, updates, { merge: true }); 
        } catch (e) {
            console.error("Error updating task:", e);
            setError("更新任务失败。");
        }
    }, [db, userId]);

    const deleteTask = useCallback(async (taskId) => {
        if (!db || !userId) return;
        try {
            const taskDocRef = doc(getTasksCollectionRef(db, userId), taskId);
            await deleteDoc(taskDocRef);
        } catch (e) {
            console.error("Error deleting task:", e);
            setError("删除任务失败。");
        }
    }, [db, userId]);


    // --- 渲染逻辑 ---

    const pendingTasks = tasks.filter(t => !t.is_done);
    const completedTasks = tasks.filter(t => t.is_done);

    if (!isAuthReady) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50">
                <div className="text-xl text-gray-600">正在连接数据库...</div>
            </div>
        );
    }
    
    // 如果认证就绪但用户ID丢失，检查错误状态
    if (!userId && !error.includes("Firebase 配置未找到")) {
        // 如果不是配置错误，但 userId 丢失，可能是登录问题
        return <div className="p-8 text-red-600 font-bold">错误: 无法建立匿名会话。</div>;
    }

    return (
        <div className="min-h-screen bg-gray-50 pb-20 relative">
            
            {/* 顶部标题和分组选择器 */}
            <header className="bg-white shadow-md p-4 sticky top-0 z-40 flex justify-between items-center">
                <h1 className="text-2xl font-extrabold text-blue-600 flex items-center">
                    <LayoutGrid className="w-6 h-6 mr-2" /> 任务管理器
                </h1>
                
                {/* 分组切换按钮 */}
                <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-500 hidden sm:block">切换分组:</span>
                    <select
                        value={currentGroup}
                        onChange={(e) => setCurrentGroup(e.target.value)}
                        className="p-2 border border-gray-300 rounded-lg bg-white text-gray-700 font-medium transition"
                    >
                        {defaultGroups.map(group => (
                            <option key={group} value={group}>{group}</option>
                        ))}
                    </select>
                </div>
            </header>
            
            <div className="p-4 sm:p-6 max-w-2xl mx-auto">
                {/* 用户信息和错误/加载状态 */}
                <div className="mb-4 text-sm text-gray-500 p-3 bg-white rounded-lg shadow">
                    应用ID: <code className="break-all text-xs text-blue-500">{APP_ID}</code><br/>
                    当前用户ID: <code className="break-all text-xs">{userId || '正在登录...'}</code>
                </div>

                {error && <div className="p-3 mb-4 bg-red-100 text-red-700 rounded-lg">{error}</div>}
                
                {/* 待办任务列表 */}
                <h2 className="text-xl font-bold text-gray-700 mt-6 mb-3 border-b pb-2">
                    🚀 待办 ({pendingTasks.length})
                </h2>
                {loading && <p className="text-blue-500 p-4">正在加载 {currentGroup} 任务...</p>}
                
                <ul className="task-list">
                    {pendingTasks.length === 0 && !loading && (
                        <li className="text-gray-500 p-4 bg-white rounded-xl shadow">暂无待办任务。</li>
                    )}
                    {pendingTasks.map(task => (
                        <TaskItem 
                            key={task.id} 
                            task={task} 
                            updateTask={updateTask} 
                            deleteTask={deleteTask} 
                        />
                    ))}
                </ul>

                {/* 已完成任务列表 */}
                <h2 className="text-xl font-bold text-gray-700 mt-8 mb-3 border-b pb-2">
                    ✅ 已完成 ({completedTasks.length})
                </h2>
                <ul className="task-list">
                    {completedTasks.length === 0 && (
                        <li className="text-gray-500 p-4 bg-white rounded-xl shadow">暂无已完成任务。</li>
                    )}
                    {completedTasks.map(task => (
                        <TaskItem 
                            key={task.id} 
                            task={task} 
                            updateTask={updateTask} 
                            deleteTask={deleteTask} 
                        />
                    ))}
                </ul>
            </div>
            
            {/* 浮动操作按钮 (FAB) */}
            <button
                onClick={() => setIsModalOpen(true)}
                className="fixed bottom-6 right-6 p-4 bg-blue-600 text-white rounded-full shadow-2xl hover:bg-blue-700 transition duration-300 transform hover:scale-105 z-50"
                title="新增任务"
            >
                <Plus className="w-7 h-7" />
            </button>

            {/* 任务新增模态窗口 */}
            <TaskModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                currentGroup={currentGroup} 
                addTask={addTask}
            />
        </div>
    );
};

export default App;

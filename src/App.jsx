import React, { useState, useEffect, useCallback } from 'react';
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
    orderBy // 保持导入，但只在必要时使用
} from 'firebase/firestore';
import { Plus, X, Check, Trash2, LayoutGrid } from 'lucide-react';

// --- 1. Firebase 初始化与全局配置 ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

// 使用私有路径存储任务，确保数据与用户绑定
const getTasksCollectionRef = (db, userId) => {
    return collection(db, `artifacts/${appId}/users/${userId}/tasks`);
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
            const app = initializeApp(firebaseConfig);
            const firestoreDb = getFirestore(app);
            const auth = getAuth(app);
            setDb(firestoreDb);

            // 1. 认证流程：使用自定义令牌或匿名登录
            const handleAuth = async () => {
                try {
                    if (initialAuthToken) {
                        const userCredential = await signInWithCustomToken(auth, initialAuthToken);
                        setUserId(userCredential.user.uid);
                    } else {
                        const userCredential = await signInAnonymously(auth);
                        setUserId(userCredential.user.uid);
                    }
                } catch (e) {
                    console.error("Firebase Auth Error:", e);
                    setError("认证失败。请检查 Firebase 配置。");
                } finally {
                    setIsAuthReady(true);
                }
            };

            // 2. 确保在 DOM 加载时立即尝试认证
            handleAuth();

            // 3. 监听 Auth 状态变化
            const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
                if (user) {
                    setUserId(user.uid);
                } else {
                    // Fallback to anonymous if auth fails later
                    if (!userId) {
                         signInAnonymously(auth);
                    }
                }
            });

            return () => unsubscribeAuth();

        } catch (e) {
            console.error("Firebase Initialization Error:", e);
            setError("Firebase 初始化失败。");
        }
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
            
            // 【修复开始】: 移除 Firestore 复杂的 orderBy，只保留 where，避免索引错误
            const q = query(
                tasksRef, 
                where('groupId', '==', currentGroup)
            );
            // 【修复结束】
            
            // 实时监听器
            const unsubscribe = onSnapshot(q, (snapshot) => {
                const fetchedTasks = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                
                // 【修复开始】: 在客户端（JavaScript）执行排序
                fetchedTasks.sort((a, b) => {
                    // 1. 按 is_done 排序：未完成 (false) 排在已完成 (true) 前面
                    if (a.is_done !== b.is_done) {
                        return a.is_done ? 1 : -1;
                    }
                    // 2. 然后按 title 字母顺序排序
                    if (a.title < b.title) return -1;
                    if (a.title > b.title) return 1;
                    return 0;
                });
                // 【修复结束】

                setTasks(fetchedTasks);
                setLoading(false);
            }, (err) => {
                console.error("Firestore Listen Error:", err);
                setError("实时数据同步失败。");
                setLoading(false);
            });

            // 清理函数
            return () => unsubscribe();
            
        } catch (e) {
            console.error("Firestore Query Setup Error:", e);
            setError("查询设置错误。");
            setLoading(false);
        }
        // 依赖项：当 db, userId 或 currentGroup 变化时，重新建立监听器
    }, [db, userId, isAuthReady, currentGroup]);


    // --- Firestore 操作函数 ---

    const addTask = useCallback(async (title, importance) => {
        if (!db || !userId) return;
        try {
            await addDoc(getTasksCollectionRef(db, userId), {
                title,
                importance,
                is_done: false,
                groupId: currentGroup, // 绑定当前组
                userId: userId, // 绑定用户ID
                createdAt: new Date() // 用于排序和跟踪
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
                <div className="text-xl text-gray-600">正在认证并连接 Firebase...</div>
            </div>
        );
    }
    
    // 如果认证就绪但用户ID丢失（不应该发生），显示错误
    if (!userId) {
        return <div className="p-8 text-red-600 font-bold">错误: 无法获取用户身份信息。</div>;
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
                    当前用户ID: <code className="break-all text-xs">{userId}</code><br/>
                    当前分组: <span className="font-semibold text-blue-600">{currentGroup}</span>
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

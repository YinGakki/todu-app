import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged 
} from 'firebase/auth';
import { 
    getFirestore, collection, query, where, onSnapshot, 
    doc, setDoc, addDoc, deleteDoc, updateDoc
} from 'firebase/firestore';
import { 
    Plus, X, Check, Trash2, LayoutGrid, Zap, LogOut, 
    Sun, Moon, Monitor, ChevronDown, ChevronUp, CornerDownRight 
} from 'lucide-react';

// --- 1. 配置与工具 ---

// ✅ 使用正确的 Vercel 环境变量读取方式
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};
const appId = firebaseConfig.appId || 'default-app-id';

// 判断北京时间是否为黑夜 (19:00 - 08:00)
const isBeijingNight = () => {
    const now = new Date();
    // 转换为 UTC 时间戳
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    // 转换为北京时间 (UTC+8)
    const beijingTime = new Date(utc + (3600000 * 8));
    const hour = beijingTime.getHours();
    // 晚上 19点(含)以后 或 早上 8点(不含)以前
    return hour >= 19 || hour < 8;
};

// 数据库路径
const getTasksCollectionRef = (db, userId) => {
    return collection(db, `artifacts/${appId}/users/${userId}/tasks`);
};

// --- 2. 登录组件 (美化版) ---
const AuthForm = ({ auth, error, setError }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        setError('');
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (e) {
            setError('登录失败：' + e.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 p-4">
            <div className="bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl w-full max-w-sm p-8 space-y-6 transform transition hover:scale-[1.01] duration-300">
                <h1 className="text-3xl font-extrabold text-center text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-purple-600">
                    欢迎回来
                </h1>
                {error && <div className="p-3 bg-red-100 text-red-600 text-sm rounded-lg">{error}</div>}
                <form onSubmit={handleLogin} className="space-y-5">
                    <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full p-4 bg-gray-50 border-transparent focus:bg-white focus:border-purple-500 focus:ring-0 rounded-xl transition shadow-inner"
                        placeholder="邮箱 (Email)"
                        required
                    />
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full p-4 bg-gray-50 border-transparent focus:bg-white focus:border-purple-500 focus:ring-0 rounded-xl transition shadow-inner"
                        placeholder="密码 (Password)"
                        required
                    />
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-gradient-to-r from-blue-600 to-purple-600 text-white font-bold py-4 rounded-xl shadow-lg hover:shadow-xl hover:translate-y-[-2px] transition duration-300 disabled:opacity-70"
                    >
                        {isLoading ? '登录中...' : '立即登录'}
                    </button>
                </form>
            </div>
        </div>
    );
};

// --- 3. 核心组件：增强版任务项 (支持子任务) ---
const TaskItem = ({ task, updateTask, deleteTask }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const [newSubtask, setNewSubtask] = useState('');

    // 添加子任务
    const handleAddSubtask = async (e) => {
        e.preventDefault();
        if (!newSubtask.trim()) return;
        
        const subItem = {
            id: Date.now().toString(),
            title: newSubtask,
            is_done: false
        };
        
        const updatedSubtasks = [...(task.subtasks || []), subItem];
        await updateTask(task.id, { subtasks: updatedSubtasks });
        setNewSubtask('');
    };

    // 切换子任务状态
    const toggleSubtask = async (subId) => {
        const updatedSubtasks = task.subtasks.map(sub => 
            sub.id === subId ? { ...sub, is_done: !sub.is_done } : sub
        );
        await updateTask(task.id, { subtasks: updatedSubtasks });
    };

    // 删除子任务
    const removeSubtask = async (subId) => {
        const updatedSubtasks = task.subtasks.filter(sub => sub.id !== subId);
        await updateTask(task.id, { subtasks: updatedSubtasks });
    };

    const completedSubtasks = task.subtasks?.filter(s => s.is_done).length || 0;
    const totalSubtasks = task.subtasks?.length || 0;
    const progress = totalSubtasks === 0 ? 0 : (completedSubtasks / totalSubtasks) * 100;

    return (
        <li className="group mb-4 animate-slide-in">
            {/* 主卡片 */}
            <div className={`
                relative flex flex-col p-5 rounded-2xl transition-all duration-300 border
                ${task.is_done 
                    ? 'bg-gray-100/80 dark:bg-gray-800/50 border-transparent opacity-75' 
                    : 'bg-white/80 dark:bg-gray-800/80 hover:bg-white dark:hover:bg-gray-750 border-white/20 hover:shadow-xl shadow-sm backdrop-blur-md'
                }
            `}>
                <div className="flex items-start justify-between">
                    <div className="flex items-center flex-1 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
                        {/* 进度环或勾选框 */}
                        <div 
                            onClick={(e) => { e.stopPropagation(); updateTask(task.id, { is_done: !task.is_done }); }}
                            className={`
                                flex-shrink-0 w-6 h-6 rounded-full border-2 mr-3 flex items-center justify-center transition-colors
                                ${task.is_done 
                                    ? 'bg-green-500 border-green-500' 
                                    : 'border-gray-400 hover:border-blue-500 dark:border-gray-500'
                                }
                            `}
                        >
                            {task.is_done && <Check className="w-4 h-4 text-white" />}
                        </div>

                        <div className="flex-1 min-w-0">
                            <h3 className={`text-lg font-medium truncate transition-all ${task.is_done ? 'text-gray-500 line-through decoration-2 decoration-gray-400' : 'text-gray-800 dark:text-gray-100'}`}>
                                {task.title}
                            </h3>
                            {totalSubtasks > 0 && (
                                <div className="flex items-center mt-1 space-x-2">
                                    <div className="h-1.5 flex-1 max-w-[100px] bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                                        <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${progress}%` }}></div>
                                    </div>
                                    <span className="text-xs text-gray-500 dark:text-gray-400">{completedSubtasks}/{totalSubtasks}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity ml-2">
                        <button 
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="p-2 text-gray-400 hover:text-blue-500 transition rounded-full hover:bg-gray-100 dark:hover:bg-gray-700"
                        >
                            {isExpanded ? <ChevronUp className="w-5 h-5"/> : <ChevronDown className="w-5 h-5"/>}
                        </button>
                        <button
                            onClick={() => deleteTask(task.id)}
                            className="p-2 text-gray-400 hover:text-red-500 transition rounded-full hover:bg-red-50 dark:hover:bg-red-900/30"
                        >
                            <Trash2 className="w-5 h-5" />
                        </button>
                    </div>
                </div>

                {/* 子任务区域 */}
                <div className={`overflow-hidden transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-96 mt-4 opacity-100' : 'max-h-0 opacity-0'}`}>
                    <div className="pl-9 space-y-2">
                        {task.subtasks?.map(sub => (
                            <div key={sub.id} className="flex items-center justify-between group/sub">
                                <div 
                                    onClick={() => toggleSubtask(sub.id)}
                                    className="flex items-center flex-1 cursor-pointer"
                                >
                                    <div className={`w-4 h-4 border rounded mr-3 flex items-center justify-center transition ${sub.is_done ? 'bg-purple-500 border-purple-500' : 'border-gray-300 dark:border-gray-600'}`}>
                                        {sub.is_done && <Check className="w-3 h-3 text-white" />}
                                    </div>
                                    <span className={`text-sm ${sub.is_done ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-300'}`}>
                                        {sub.title}
                                    </span>
                                </div>
                                <button onClick={() => removeSubtask(sub.id)} className="opacity-0 group-hover/sub:opacity-100 text-gray-400 hover:text-red-500">
                                    <X className="w-3 h-3" />
                                </button>
                            </div>
                        ))}
                        
                        <form onSubmit={handleAddSubtask} className="flex items-center mt-3">
                            <CornerDownRight className="w-4 h-4 text-gray-400 mr-2" />
                            <input
                                type="text"
                                value={newSubtask}
                                onChange={(e) => setNewSubtask(e.target.value)}
                                placeholder="添加子步骤..."
                                className="flex-1 bg-transparent border-b border-gray-200 dark:border-gray-700 py-1 text-sm focus:border-blue-500 focus:outline-none dark:text-gray-200 transition"
                            />
                            <button type="submit" disabled={!newSubtask.trim()} className="ml-2 text-blue-500 text-sm font-medium hover:text-blue-600 disabled:opacity-50">
                                添加
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </li>
    );
};

// --- 4. 主程序 ---
const App = () => {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [tasks, setTasks] = useState([]);
    const [currentGroup, setCurrentGroup] = useState('个人');
    const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
    
    // 主题控制 state ('light' | 'dark' | 'auto')
    const [themeMode, setThemeMode] = useState('auto');
    const [newTaskTitle, setNewTaskTitle] = useState('');

    // 初始化 Firebase
    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            setDb(getFirestore(app));
            setAuth(getAuth(app));
            onAuthStateChanged(getAuth(app), (user) => setUserId(user ? user.uid : null));
        } catch (e) {
            console.error("Firebase Init Error:", e);
        }
    }, []);

    // 监听任务数据
    useEffect(() => {
        if (!db || !userId) return;
        const q = query(getTasksCollectionRef(db, userId), where('groupId', '==', currentGroup));
        return onSnapshot(q, (snapshot) => {
            const fetched = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            // 排序：未完成在前 -> 创建时间倒序
            fetched.sort((a, b) => {
                if (a.is_done !== b.is_done) return a.is_done ? 1 : -1;
                return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
            });
            setTasks(fetched);
        });
    }, [db, userId, currentGroup]);

    // 主题逻辑
    useEffect(() => {
        const root = window.document.documentElement;
        const applyTheme = () => {
            let isDark = false;
            if (themeMode === 'dark') isDark = true;
            else if (themeMode === 'light') isDark = false;
            else if (themeMode === 'auto') isDark = isBeijingNight();

            if (isDark) root.classList.add('dark');
            else root.classList.remove('dark');
        };
        
        applyTheme();
        // 如果是 auto，每分钟检查一次时间
        let interval;
        if (themeMode === 'auto') {
            interval = setInterval(applyTheme, 60000);
        }
        return () => clearInterval(interval);
    }, [themeMode]);

    // CRUD 操作
    const addTask = async (e) => {
        e.preventDefault();
        if (!newTaskTitle.trim()) return;
        await addDoc(getTasksCollectionRef(db, userId), {
            title: newTaskTitle.trim(),
            is_done: false,
            groupId: currentGroup,
            subtasks: [], // 初始化子任务数组
            userId,
            createdAt: new Date()
        });
        setNewTaskTitle('');
        setIsTaskModalOpen(false);
    };

    const updateTask = async (taskId, updates) => {
        await updateDoc(doc(getTasksCollectionRef(db, userId), taskId), updates);
    };

    const deleteTask = async (taskId) => {
        if (confirm("确定要删除这个任务吗？")) {
            await deleteDoc(doc(getTasksCollectionRef(db, userId), taskId));
        }
    };

    if (!userId) return <AuthForm auth={auth} error="" setError={() => {}} />;

    const pendingTasks = tasks.filter(t => !t.is_done);
    const completedTasks = tasks.filter(t => t.is_done);

    // 渲染主题切换按钮
    const ThemeToggle = () => (
        <div className="bg-gray-100 dark:bg-gray-700 p-1 rounded-full flex items-center space-x-1 shadow-inner">
            {[
                { mode: 'light', icon: Sun, label: '亮' },
                { mode: 'auto', icon: Monitor, label: '自动' },
                { mode: 'dark', icon: Moon, label: '暗' },
            ].map(({ mode, icon: Icon }) => (
                <button
                    key={mode}
                    onClick={() => setThemeMode(mode)}
                    className={`p-1.5 rounded-full transition-all duration-300 ${
                        themeMode === mode 
                        ? 'bg-white dark:bg-gray-600 text-yellow-500 shadow-sm scale-110' 
                        : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'
                    }`}
                    title={mode}
                >
                    <Icon className="w-4 h-4" />
                </button>
            ))}
        </div>
    );

    return (
        <div className="min-h-screen transition-colors duration-500 bg-gray-50 dark:bg-gray-900 font-sans selection:bg-blue-200 dark:selection:bg-blue-900">
            {/* 动态背景装饰 */}
            <div className="fixed inset-0 pointer-events-none overflow-hidden">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-400/20 rounded-full blur-[100px] animate-pulse"></div>
                <div className="absolute bottom-[10%] right-[-5%] w-[30%] h-[30%] bg-purple-400/20 rounded-full blur-[100px] animate-pulse delay-1000"></div>
            </div>

            <div className="relative z-10 max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
                {/* 顶部导航 */}
                <header className="flex flex-col sm:flex-row justify-between items-center mb-10 gap-4">
                    <div className="flex items-center space-x-3">
                        <div className="bg-gradient-to-tr from-blue-600 to-purple-600 p-2.5 rounded-xl shadow-lg">
                            <LayoutGrid className="w-6 h-6 text-white" />
                        </div>
                        <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-gray-800 to-gray-600 dark:from-white dark:to-gray-300">
                            任务管理器
                        </h1>
                    </div>
                    
                    <div className="flex items-center space-x-4 bg-white/50 dark:bg-gray-800/50 backdrop-blur-md p-2 rounded-2xl border border-white/20 shadow-sm">
                        <ThemeToggle />
                        <div className="h-6 w-px bg-gray-300 dark:bg-gray-600"></div>
                        <select
                            value={currentGroup}
                            onChange={(e) => setCurrentGroup(e.target.value)}
                            className="bg-transparent text-sm font-medium text-gray-700 dark:text-gray-200 outline-none cursor-pointer hover:text-blue-600 transition"
                        >
                            {['个人', '工作', '家庭'].map(g => <option key={g} value={g} className="dark:bg-gray-800">{g}</option>)}
                        </select>
                        <button onClick={() => signOut(auth)} className="text-gray-400 hover:text-red-500 transition p-1">
                            <LogOut className="w-5 h-5" />
                        </button>
                    </div>
                </header>

                {/* 统计概览卡片 */}
                <div className="grid grid-cols-3 gap-4 mb-8">
                    <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-4 text-white shadow-lg shadow-blue-500/20 transform hover:scale-[1.02] transition">
                        <p className="text-blue-100 text-xs font-medium uppercase tracking-wider mb-1">待办</p>
                        <p className="text-3xl font-bold">{pendingTasks.length}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
                        <p className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-1">已完成</p>
                        <p className="text-3xl font-bold text-gray-800 dark:text-white">{completedTasks.length}</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-gray-700">
                        <p className="text-gray-400 text-xs font-medium uppercase tracking-wider mb-1">进度</p>
                        <p className="text-3xl font-bold text-green-500">
                            {tasks.length > 0 ? Math.round((completedTasks.length / tasks.length) * 100) : 0}%
                        </p>
                    </div>
                </div>

                {/* 任务列表 */}
                <div className="space-y-8">
                    <section>
                        <h2 className="text-lg font-bold text-gray-700 dark:text-gray-200 mb-4 flex items-center">
                            待办事项 <span className="ml-2 px-2 py-0.5 bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 text-xs rounded-full">{pendingTasks.length}</span>
                        </h2>
                        {pendingTasks.length === 0 ? (
                            <div className="text-center py-10 bg-white/50 dark:bg-gray-800/30 rounded-2xl border border-dashed border-gray-300 dark:border-gray-700">
                                <p className="text-gray-400 dark:text-gray-500">🎉 太棒了，所有任务都搞定了！</p>
                            </div>
                        ) : (
                            <ul>
                                {pendingTasks.map(task => (
                                    <TaskItem key={task.id} task={task} updateTask={updateTask} deleteTask={deleteTask} />
                                ))}
                            </ul>
                        )}
                    </section>

                    {completedTasks.length > 0 && (
                        <section className="opacity-80 hover:opacity-100 transition duration-500">
                            <h2 className="text-lg font-bold text-gray-500 dark:text-gray-400 mb-4">已完成</h2>
                            <ul>
                                {completedTasks.map(task => (
                                    <TaskItem key={task.id} task={task} updateTask={updateTask} deleteTask={deleteTask} />
                                ))}
                            </ul>
                        </section>
                    )}
                </div>
            </div>

            {/* 悬浮添加按钮 */}
            <button
                onClick={() => setIsTaskModalOpen(true)}
                className="fixed bottom-8 right-8 p-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-full shadow-2xl shadow-blue-500/40 hover:scale-110 active:scale-95 transition-all duration-300 z-50 group"
            >
                <Plus className="w-7 h-7 group-hover:rotate-90 transition duration-300" />
            </button>

            {/* 新增任务模态框 */}
            {isTaskModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
                    <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-2xl w-full max-w-md p-6 transform transition-all scale-100 animate-slide-in">
                        <div className="flex justify-between items-center mb-6">
                            <h3 className="text-xl font-bold text-gray-800 dark:text-white">新任务 · {currentGroup}</h3>
                            <button onClick={() => setIsTaskModalOpen(false)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700 transition">
                                <X className="w-5 h-5 text-gray-500" />
                            </button>
                        </div>
                        <form onSubmit={addTask}>
                            <input
                                autoFocus
                                type="text"
                                value={newTaskTitle}
                                onChange={(e) => setNewTaskTitle(e.target.value)}
                                placeholder="准备做什么？"
                                className="w-full text-lg p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl border-2 border-transparent focus:border-blue-500 focus:bg-white dark:focus:bg-gray-700 outline-none transition mb-6 dark:text-white"
                            />
                            <div className="flex justify-end space-x-3">
                                <button
                                    type="button"
                                    onClick={() => setIsTaskModalOpen(false)}
                                    className="px-5 py-2.5 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-xl transition font-medium"
                                >
                                    取消
                                </button>
                                <button
                                    type="submit"
                                    disabled={!newTaskTitle.trim()}
                                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 transition disabled:opacity-50 disabled:shadow-none"
                                >
                                    创建任务
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
};

export default App;

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
    orderBy
} from 'firebase/firestore';
import { Plus, X, Check, Trash2, LayoutGrid, Loader2, Zap, User, Sparkles } from 'lucide-react';

// --- 1. Global Configuration and Firebase Setup ---
const APP_ID = typeof __app_id !== 'undefined' ? __app_id : 'default-todo-app';
let FIREBASE_CONFIG = {};
let INITIAL_AUTH_TOKEN = null;

try {
    if (typeof __firebase_config !== 'undefined' && __firebase_config) {
        FIREBASE_CONFIG = JSON.parse(__firebase_config);
    }
    INITIAL_AUTH_TOKEN = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;
} catch (e) {
    console.error("Firebase environment configuration failed:", e);
}

// Function to get the correct Firestore collection reference
const getTasksCollectionRef = (db, userId) => {
    // Private path: /artifacts/{appId}/users/{userId}/tasks
    return collection(db, `${APP_ID}/users/${userId}/tasks`);
};

// Default task groups
const defaultGroups = ['个人', '工作', '家庭'];

// --- 2. Utility Components ---

const LoadingSpinner = () => (
    <div className="flex justify-center items-center py-8">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
        <p className="ml-3 text-lg text-gray-500">数据加载中...</p>
    </div>
);

// --- 3. Task Modal Component (Omitted for brevity, assumed correct) ---

const TaskModal = ({ isOpen, onClose, currentGroup, addTask }) => {
    const [title, setTitle] = useState('');
    const [importance, setImportance] = useState('普通');

    const handleSubmit = (e) => {
        e.preventDefault();
        if (title.trim()) {
            addTask(title.trim(), importance);
            setTitle('');
            setImportance('普通'); 
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50 transition-opacity duration-300 backdrop-blur-sm" onClick={onClose}>
            <div 
                className="bg-white rounded-3xl shadow-2xl w-full max-w-lg p-8 transform scale-95 opacity-0 animate-modal-in"
                onClick={e => e.stopPropagation()} 
            >
                <div className="flex justify-between items-center mb-6 border-b pb-3">
                    <h2 className="text-2xl font-extrabold text-indigo-700">为「{currentGroup}」新增任务</h2>
                    <button onClick={onClose} className="p-2 rounded-full text-gray-500 hover:bg-red-100 hover:text-red-500 transition duration-200">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                <form onSubmit={handleSubmit}>
                    <div className="mb-5">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">任务标题</label>
                        <input
                            type="text"
                            value={title}
                            onChange={(e) => setTitle(e.target.value)}
                            placeholder="输入简明扼要的任务描述"
                            className="w-full p-4 border border-indigo-200 rounded-xl focus:ring-indigo-500 focus:border-indigo-500 transition duration-200 shadow-inner"
                            required
                            autoFocus
                        />
                    </div>
                    <div className="mb-8">
                        <label className="block text-sm font-semibold text-gray-700 mb-2">重要程度</label>
                        <div className="flex space-x-4">
                            {['高', '普通'].map(level => (
                                <button
                                    key={level}
                                    type="button"
                                    onClick={() => setImportance(level)}
                                    className={`flex items-center justify-center w-1/2 py-3 rounded-xl transition duration-200 ${
                                        importance === level
                                            ? (level === '高' ? 'bg-red-500 text-white shadow-lg shadow-red-200' : 'bg-indigo-500 text-white shadow-lg shadow-indigo-200')
                                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                                    }`}
                                >
                                    {level === '高' && <Zap className="w-4 h-4 mr-2" />}
                                    {level}
                                </button>
                            ))}
                        </div>
                    </div>
                    
                    <button
                        type="submit"
                        className="w-full bg-indigo-600 text-white font-bold text-lg py-4 rounded-xl shadow-xl hover:bg-indigo-700 transition duration-200 transform hover:scale-[1.01] active:scale-100"
                    >
                        确认并添加任务
                    </button>
                </form>
            </div>
        </div>
    );
};

// --- 4. AI Breakdown Modal Component (Omitted for brevity, assumed correct) ---

const BreakdownModal = ({ isOpen, onClose, title, breakdown, loading }) => {
    if (!isOpen) return null;
    
    const formattedBreakdown = breakdown.split('\n').map((line, index) => (
        <React.Fragment key={index}>
            {line}
            <br />
        </React.Fragment>
    ));

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50 transition-opacity duration-300 backdrop-blur-sm" onClick={onClose}>
            <div 
                className="bg-white rounded-3xl shadow-2xl w-full max-w-xl p-8 transform scale-95 opacity-0 animate-modal-in"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-6 border-b pb-3">
                    <h2 className="text-2xl font-extrabold text-purple-700 flex items-center">
                        <Sparkles className="w-6 h-6 mr-2 text-yellow-500"/> AI 任务拆解
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-full text-gray-500 hover:bg-red-100 hover:text-red-500 transition duration-200">
                        <X className="w-6 h-6" />
                    </button>
                </div>
                
                <h3 className="text-xl font-bold text-gray-800 mb-4 bg-indigo-50 p-3 rounded-xl">任务: {title}</h3>

                {loading ? (
                    <LoadingSpinner />
                ) : (
                    <div className="p-4 bg-gray-50 rounded-xl shadow-inner max-h-96 overflow-y-auto text-gray-700 leading-relaxed">
                        {formattedBreakdown}
                    </div>
                )}

                <button
                    onClick={onClose}
                    className="mt-6 w-full bg-purple-600 text-white font-bold py-3 rounded-xl shadow-lg hover:bg-purple-700 transition duration-200"
                >
                    关闭建议
                </button>
            </div>
        </div>
    );
};

// --- 5. Task Item Component (Omitted for brevity, assumed correct) ---

const TaskItem = ({ task, updateTask, deleteTask, onGenerateBreakdown }) => {
    
    const importanceBadge = task.importance === '高' 
        ? <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600">高优先级</span>
        : <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-600">普通</span>;

    const completedStyle = task.is_done 
        ? 'opacity-60 bg-gray-50 line-through text-gray-500'
        : 'bg-white hover:bg-indigo-50 hover:shadow-xl';

    return (
        <li 
            className={`flex items-center justify-between p-5 mb-4 rounded-2xl border-l-4 transition-all duration-300 ease-in-out transform hover:-translate-y-0.5 ${completedStyle} ${
                task.importance === '高' ? 'border-red-400' : 'border-indigo-400'
            }`}
        >
            <div className="flex-1 min-w-0 flex items-start space-x-4">
                <button
                    onClick={() => updateTask(task.id, { is_done: !task.is_done })}
                    className={`p-1.5 mt-0.5 rounded-full border-2 transition-colors duration-200 flex-shrink-0 ${
                        task.is_done 
                            ? 'bg-green-500 border-green-500 text-white' 
                            : 'bg-white border-gray-300 hover:border-indigo-400'
                    }`}
                    title={task.is_done ? "取消完成" : "标记完成"}
                >
                    <Check className={`w-4 h-4 ${task.is_done ? '' : 'opacity-0'}`} />
                </button>

                <div className="min-w-0">
                    <p className={`text-lg font-bold truncate ${task.is_done ? 'text-gray-500' : 'text-gray-800'}`}>{task.title}</p>
                    <div className="mt-1 flex space-x-3 items-center">
                        {importanceBadge}
                        <p className="text-sm text-gray-400">
                            创建于: {new Date(task.createdAt).toLocaleDateString()}
                        </p>
                    </div>
                </div>
            </div>

            <div className="flex space-x-2 items-center">
                 {/* AI Breakdown Button */}
                <button
                    onClick={() => onGenerateBreakdown(task.title)}
                    className="p-3 text-purple-600 bg-purple-100 rounded-full hover:bg-purple-500 hover:text-white transition duration-200 flex-shrink-0 shadow-md flex items-center"
                    title="AI 任务拆解"
                    disabled={task.is_done} 
                >
                    <Sparkles className="w-5 h-5" />
                </button>

                <button
                    onClick={() => deleteTask(task.id)}
                    className="p-3 text-red-400 bg-red-50 rounded-full hover:bg-red-500 hover:text-white transition duration-200 flex-shrink-0 shadow-md"
                    title="删除任务"
                >
                    <Trash2 className="w-5 h-5" />
                </button>
            </div>
        </li>
    );
};


// --- 6. Main App Component ---

const App = () => {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [tasks, setTasks] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [isAuthReady, setIsAuthReady] = useState(false); // Flag to ensure userId is available
    
    const [currentGroup, setCurrentGroup] = useState(defaultGroups[0]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    
    const [breakdownState, setBreakdownState] = useState({
        isOpen: false,
        title: '',
        breakdown: '点击任务旁的 ✨ 按钮开始生成建议...',
        loading: false,
    });


    // --- Gemini API Call Logic (Unchanged) ---
    const generateTaskBreakdown = useCallback(async (title) => {
        setBreakdownState({ isOpen: true, title: title, breakdown: '', loading: true });
        
        const apiKey = ""; 
        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
        
        const systemPrompt = "You are a world-class productivity coach. Given a single task title, your job is to break it down into 3-5 actionable subtasks, provide a short motivational summary, and suggest the best first step. Format the output as a numbered list of steps, followed by the summary and first step on new lines. Do not use any markdown headers.";
        const userQuery = `Task: ${title}. Provide the breakdown now.`;
        
        const payload = {
            contents: [{ parts: [{ text: userQuery }] }],
            systemInstruction: {
                parts: [{ text: systemPrompt }]
            },
        };

        const maxRetries = 5;
        let delay = 1000;
        let generatedText = '任务分解失败，请稍后重试。';

        for (let i = 0; i < maxRetries; i++) {
            try {
                const response = await fetch(apiUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (response.ok) {
                    const result = await response.json();
                    generatedText = result.candidates?.[0]?.content?.parts?.[0]?.text || '未能生成有效的任务分解。';
                    break; 
                } else if (response.status === 429 && i < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2;
                } else {
                    throw new Error(`API call failed with status: ${response.status}`);
                }
            } catch (error) {
                console.error('Gemini API fetch error:', error);
                if (i < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                    delay *= 2;
                } else {
                    generatedText = `无法连接到 AI 服务：${error.message}`;
                    break; 
                }
            }
        }
        
        setBreakdownState(prev => ({
            ...prev,
            breakdown: generatedText,
            loading: false,
        }));
    }, []);


    // --- Firebase Auth & Init (FIXED TIMING) ---
    useEffect(() => {
        if (!FIREBASE_CONFIG.apiKey) {
            setError("错误: Firebase 配置缺失。无法初始化数据库连接。");
            setIsAuthReady(true);
            return; 
        }

        const initFirebaseAndAuth = async () => {
            let unsubscribeAuth = () => {};
            try {
                const app = initializeApp(FIREBASE_CONFIG);
                const firestoreDb = getFirestore(app);
                const authInstance = getAuth(app);
                
                // 1. Set instances immediately
                setDb(firestoreDb);
                setAuth(authInstance);

                // 2. Perform initial sign-in and WAIT for it to resolve
                if (INITIAL_AUTH_TOKEN) {
                    await signInWithCustomToken(authInstance, INITIAL_AUTH_TOKEN);
                } else {
                    await signInAnonymously(authInstance);
                }

                // 3. Setup listener (It will fire immediately with the now-logged-in user)
                unsubscribeAuth = onAuthStateChanged(authInstance, (user) => {
                    if (user) {
                        // User is now guaranteed to be set after sign-in resolved
                        setUserId(user.uid);
                    } else {
                        setUserId(null); 
                    }
                });
                
            } catch (e) {
                console.error("Firebase Initialization/Auth Error:", e);
                setError(`Firebase 初始化/身份验证失败: ${e.message}`);
            } finally {
                // 4. Crucial: Mark ready ONLY after the initial sign-in attempt is done (success or failure)
                setIsAuthReady(true);
            }
            return unsubscribeAuth;
        };

        const cleanupPromise = initFirebaseAndAuth();

        return () => {
            // Cleanup the auth listener when the component unmounts
            cleanupPromise.then(unsub => unsub && unsub());
        };
        
    }, []);


    // --- Firestore Realtime Listener (Unchanged) ---
    useEffect(() => {
        // Guard clause: Do not proceed until Firebase and user ID are ready
        if (!db || !userId || !isAuthReady) {
            setLoading(false); 
            return;
        }

        setLoading(true);
        setError('');
        
        try {
            const tasksRef = getTasksCollectionRef(db, userId);
            
            // Query for tasks in the current group, sorted by completion status and creation time
            const q = query(
                tasksRef, 
                where('groupId', '==', currentGroup),
                orderBy('is_done'),
                orderBy('createdAt', 'desc') 
            );

            const unsubscribe = onSnapshot(q, (snapshot) => {
                const fetchedTasks = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                setTasks(fetchedTasks);
                setLoading(false);
            }, (err) => {
                console.error("Firestore Listen Error:", err);
                if (err.code === 'failed-precondition') {
                     setError("查询设置错误：请检查 Firebase Console 是否已创建复合索引 (groupId, is_done, createdAt)");
                } else {
                     setError("实时数据同步失败。请检查 Firestore 规则。");
                }
                setLoading(false);
            });

            return () => unsubscribe();
            
        } catch (e) {
            console.error("Firestore Query Setup Error:", e);
            setError("查询设置错误。");
            setLoading(false);
        }
    }, [db, userId, isAuthReady, currentGroup]);


    // --- Firestore CRUD Operations (Unchanged) ---
    const dbOperationsReady = db && userId;

    const addTask = useCallback(async (title, importance) => {
        if (!dbOperationsReady) {
            setError("数据库未准备好。请稍候或检查配置。");
            return;
        }
        try {
            await addDoc(getTasksCollectionRef(db, userId), {
                title,
                importance,
                is_done: false,
                groupId: currentGroup, 
                userId: userId, 
                createdAt: new Date().getTime()
            });
        } catch (e) {
            console.error("Error adding task:", e);
            setError("添加任务失败。");
        }
    }, [db, userId, currentGroup, dbOperationsReady]);

    const updateTask = useCallback(async (taskId, updates) => {
        if (!dbOperationsReady) return;
        try {
            const taskDocRef = doc(getTasksCollectionRef(db, userId), taskId);
            await setDoc(taskDocRef, updates, { merge: true }); 
        } catch (e) {
            console.error("Error updating task:", e);
            setError("更新任务失败。");
        }
    }, [db, userId, dbOperationsReady]);

    const deleteTask = useCallback(async (taskId) => {
        if (!dbOperationsReady) return;
        try {
            const taskDocRef = doc(getTasksCollectionRef(db, userId), taskId);
            await deleteDoc(taskDocRef);
        } catch (e) {
            console.error("Error deleting task:", e);
            setError("删除任务失败。");
        }
    }, [db, userId, dbOperationsReady]);


    // --- Render Logic (Unchanged) ---
    const pendingTasks = tasks.filter(t => !t.is_done);
    const completedTasks = tasks.filter(t => t.is_done);

    if (!isAuthReady) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50">
                <LoadingSpinner />
            </div>
        );
    }
    
    const userStatus = auth?.currentUser?.isAnonymous ? "匿名用户" : (auth?.currentUser?.uid ? "已登录" : "未登录");

    return (
        <div className="min-h-screen bg-gray-50 pb-28 relative font-sans">
            <style>{`
                /* Global Content Fade In */
                @keyframes fadeIn { 
                    from { opacity: 0; } 
                    to { opacity: 1; } 
                }
                .animate-global-fade-in { animation: fadeIn 0.5s ease-out forwards; }

                /* Modal Fade In/Slide Up */
                @keyframes modal-in {
                    from { opacity: 0; transform: translateY(20px) scale(0.95); }
                    to { opacity: 1; transform: translateY(0) scale(1); }
                }
                .animate-modal-in {
                    animation: modal-in 0.3s ease-out forwards;
                }
            `}</style>
            
            <header className="bg-gradient-to-r from-indigo-600 to-blue-500 shadow-xl p-5 sticky top-0 z-40">
                <div className="max-w-2xl mx-auto flex justify-between items-center">
                    <h1 className="text-3xl font-black text-white flex items-center">
                        <LayoutGrid className="w-7 h-7 mr-2" /> 任务板
                    </h1>
                    
                    <div className="flex items-center space-x-2 bg-white/20 p-1 rounded-xl shadow-inner">
                        <span className="text-sm text-gray-100 hidden sm:block">分组:</span>
                        <select
                            value={currentGroup}
                            onChange={(e) => setCurrentGroup(e.target.value)}
                            className="p-2 border-none rounded-lg bg-white/90 text-indigo-800 font-semibold cursor-pointer appearance-none transition hover:bg-white"
                        >
                            {defaultGroups.map(group => (
                                <option key={group} value={group}>{group}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </header>
            
            <div className="p-4 sm:p-6 max-w-2xl mx-auto animate-global-fade-in">
                
                {/* User Info and Error/Loading Status */}
                <div className="mt-4 mb-6 text-sm p-4 bg-white rounded-xl shadow-lg border-l-4 border-indigo-400 flex justify-between items-center">
                    <div>
                        <p className="font-bold text-gray-700">当前用户 ({userStatus})</p>
                        <code className="break-all text-xs text-gray-500 mt-1 flex items-center">
                            <User className="w-4 h-4 mr-1 text-indigo-500"/>
                            {userId || 'N/A (正在等待认证)'}
                        </code>
                    </div>
                </div>

                {error && (
                    <div className="p-4 mb-4 bg-red-100 text-red-700 font-medium rounded-xl border border-red-300 shadow-md transition-all duration-300">
                        {error}
                    </div>
                )}
                
                {/* Pending Tasks List */}
                <h2 className="text-2xl font-extrabold text-gray-700 mt-8 mb-4 border-b-2 border-indigo-100 pb-2 flex items-center">
                    待办事项 <span className="ml-3 text-indigo-600 text-xl">({pendingTasks.length})</span>
                </h2>
                
                {loading && <LoadingSpinner />}
                
                <ul className="task-list">
                    {pendingTasks.length === 0 && !loading && (
                        <li className="text-gray-500 p-6 bg-white rounded-2xl shadow-lg text-center border-dashed border-2 border-gray-200">
                            太棒了！「{currentGroup}」分组暂无待办任务。
                        </li>
                    )}
                    {pendingTasks.map(task => (
                        <TaskItem 
                            key={task.id} 
                            task={task} 
                            updateTask={updateTask} 
                            deleteTask={deleteTask} 
                            onGenerateBreakdown={generateTaskBreakdown}
                        />
                    ))}
                </ul>

                {/* Completed Tasks List */}
                <h2 className="text-2xl font-extrabold text-gray-700 mt-10 mb-4 border-b-2 border-indigo-100 pb-2 flex items-center">
                    已完成 <span className="ml-3 text-gray-500 text-xl">({completedTasks.length})</span>
                </h2>
                <ul className="task-list">
                    {completedTasks.length > 0 && completedTasks.map(task => (
                        <TaskItem 
                            key={task.id} 
                            task={task} 
                            updateTask={updateTask} 
                            deleteTask={deleteTask} 
                            onGenerateBreakdown={generateTaskBreakdown}
                        />
                    ))}
                     {completedTasks.length === 0 && (
                        <li className="text-gray-500 p-6 bg-white rounded-2xl shadow-lg text-center border-dashed border-2 border-gray-200">
                            暂无已完成的任务记录。
                        </li>
                    )}
                </ul>
            </div>
            
            {/* Floating Action Button (FAB) */}
            <button
                onClick={() => setIsModalOpen(true)}
                className="fixed bottom-8 right-8 p-5 bg-gradient-to-r from-green-500 to-teal-500 text-white rounded-full shadow-2xl shadow-green-400/50 hover:from-green-600 hover:to-teal-600 transition-all duration-300 transform hover:scale-110 active:scale-105 z-50"
                title="新增任务"
            >
                <Plus className="w-8 h-8 font-bold" />
            </button>

            {/* Task Add Modal */}
            <TaskModal 
                isOpen={isModalOpen} 
                onClose={() => setIsModalOpen(false)} 
                currentGroup={currentGroup} 
                addTask={addTask}
            />

            {/* AI Breakdown Modal */}
            <BreakdownModal 
                isOpen={breakdownState.isOpen}
                onClose={() => setBreakdownState(prev => ({ ...prev, isOpen: false }))}
                title={breakdownState.title}
                breakdown={breakdownState.breakdown}
                loading={breakdownState.loading}
            />
        </div>
    );
};

export default App;

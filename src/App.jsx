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
    deleteDoc
} from 'firebase/firestore';
import { Plus, X, Check, Trash2, LayoutGrid, Zap, Edit3, Save } from 'lucide-react';

// --- 0. Gemini Text API Call Utility (任务分解) ---
const callGeminiAPI = async (userQuery, systemPrompt = "", retries = 3) => {
    const apiKey = "";
    const model = 'gemini-2.5-flash-preview-09-2025';
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
    };

    for (let i = 0; i < retries; i++) {
        try {
            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!response.ok) {
                throw new Error(`API call failed with status: ${response.status}`);
            }

            const result = await response.json();
            const text = result.candidates?.[0]?.content?.parts?.[0]?.text || '未能生成内容。';
            return { text };

        } catch (error) {
            console.error(`Attempt ${i + 1} failed:`, error);
            if (i < retries - 1) {
                const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
                await new Promise(resolve => setTimeout(resolve, delay));
            } else {
                throw new Error("任务分解 API 调用失败，请稍后重试。");
            }
        }
    }
};

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


// 简单的 Markdown 渲染器 (用于展示 LLM 输出)
const MarkdownRenderer = ({ content }) => {
    // 简化：将粗体 **text** 转换为 <strong>text</strong>，将换行符转换为 <br/>
    // 实际项目中会使用更复杂的 markdown 库
    const htmlContent = content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // Bold
        .split('\n').map((line, index) => {
            const isListItem = line.trim().startsWith('* ') || line.trim().startsWith('- ') || /^\d+\./.test(line.trim());
            
            // Basic list item handling for readability
            if (isListItem) {
                 return <li key={index} className="ml-5 list-disc mb-1 text-gray-700">{line.replace(/^(\* |\- |^\d+\.\s*)/, '')}</li>;
            }
            
            return <p key={index} className="mb-2 text-gray-700">{line}</p>;
        });

    return (
        <div className="prose max-w-none">
            <ul className="list-none p-0 m-0">
                {htmlContent}
            </ul>
        </div>
    );
};


// 帮助函数：从 LLM 输出中解析出可用的子任务候选
const parseSubtaskCandidates = (content) => {
    const lines = content.split('\n');
    const candidates = [];
    // 匹配 Markdown 列表项 (*, -, 1., 2. 等)
    const regex = /^\s*(\*|\-|\d+\.)\s*(.*?)$/;

    lines.forEach(line => {
        const match = line.match(regex);
        if (match) {
            // 移除粗体 markdown 格式 **text**
            let title = match[2].trim().replace(/\*\*(.*?)\*\*/g, '$1').trim();
            // 确保标题非空且不包含纯提示性文字
            if (title.length > 0 && !title.includes('步骤') && !title.includes('资源')) {
                 candidates.push(title);
            }
        }
    });
    return candidates;
};


// --- 2. 核心组件：任务分解模态窗口 (LLM 任务分解) ---
const ExpandTaskModal = ({ isOpen, onClose, task, currentGroup, addTask }) => {
    const [generatedContent, setGeneratedContent] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [llmError, setLlmError] = useState(null);
    const [subtaskCandidates, setSubtaskCandidates] = useState([]);
    
    // viewMode: 'loading', 'breakdown', 'draft'
    const [viewMode, setViewMode] = useState('loading'); 
    const [draftSubtask, setDraftSubtask] = useState({ title: '', importance: '普通' });

    const resetState = () => {
        setGeneratedContent('');
        setLlmError(null);
        setSubtaskCandidates([]);
        setViewMode('loading');
        setDraftSubtask({ title: '', importance: '普通' });
        setIsLoading(false);
    }
    
    const generateDetails = useCallback(async () => {
        setIsLoading(true);
        setLlmError(null);
        setGeneratedContent('');
        setSubtaskCandidates([]);
        setViewMode('loading');

        const userQuery = `请为我的任务：“${task.title}”（属于 ${currentGroup} 组）生成详细的分解步骤、所需资源和完成提示。请以中文输出，并使用Markdown格式，列出 3 到 5 个清晰、可操作的子步骤，用粗体标出。`;
        const systemPrompt = "你是一位高效的项目经理助理。你的任务是将用户提供的任务分解为清晰、可执行的子步骤和见解。请始终保持专业、简洁和中文的输出。";
        
        try {
            const response = await callGeminiAPI(userQuery, systemPrompt);
            setGeneratedContent(response.text);
            const candidates = parseSubtaskCandidates(response.text);
            setSubtaskCandidates(candidates);
            setViewMode('breakdown');
        } catch (e) {
            setLlmError(e.message);
            setViewMode('breakdown'); // 即使失败也停在 breakdown 视图，显示错误
        } finally {
            setIsLoading(false);
        }
    }, [task?.title, currentGroup]);

    useEffect(() => {
        if (isOpen && task) {
            // 只有在模态框打开且没有内容时才生成
            if (generatedContent === '' && !isLoading) {
                generateDetails();
            }
        }
        if (!isOpen) {
            resetState();
        }
    }, [isOpen, task, generatedContent, isLoading, generateDetails]);
    
    // --- 子任务处理逻辑 ---
    
    const handleSelectCandidate = (candidateTitle) => {
        setDraftSubtask({ title: candidateTitle, importance: '普通' });
        setViewMode('draft');
    };
    
    const handleCreateSubtask = async () => {
        if (draftSubtask.title.trim()) {
            // 使用传入的 addTask function 创建任务
            await addTask(draftSubtask.title, draftSubtask.importance);
            // 重置状态并关闭模态框
            resetState();
            onClose();
        }
    };
    
    if (!isOpen || !task) return null;

    // --- 模态框内容渲染 ---
    
    const renderContent = () => {
        if (viewMode === 'loading' || isLoading) {
            return (
                <div className="flex flex-col items-center justify-center h-full text-blue-500">
                    <div className="w-8 h-8 rounded-full border-4 border-t-4 border-blue-500 animate-spin mb-3"></div>
                    <p>Gemini 正在为您分解任务...</p>
                </div>
            );
        }
        
        if (viewMode === 'draft') {
            return (
                <div className="space-y-4">
                    <h3 className="text-xl font-semibold text-purple-600 flex items-center">
                        <Edit3 className="w-5 h-5 mr-2"/> 微调子任务草稿
                    </h3>
                    
                    <div className="p-4 border border-blue-200 bg-blue-50 rounded-lg">
                        <label className="block text-sm font-medium text-gray-700 mb-1">子任务标题</label>
                        <input
                            type="text"
                            value={draftSubtask.title}
                            onChange={(e) => setDraftSubtask({...draftSubtask, title: e.target.value})}
                            className="w-full p-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition"
                            placeholder="输入任务标题"
                            required
                        />
                    </div>
                    
                    <div className="p-4 border border-blue-200 bg-blue-50 rounded-lg">
                        <label className="block text-sm font-medium text-gray-700 mb-1">重要程度</label>
                        <select
                            value={draftSubtask.importance}
                            onChange={(e) => setDraftSubtask({...draftSubtask, importance: e.target.value})}
                            className="w-full p-2 border border-gray-300 rounded-lg bg-white focus:ring-blue-500 focus:border-blue-500 transition"
                        >
                            <option value="高">高</option>
                            <option value="普通">普通</option>
                        </select>
                    </div>
                    
                    <div className="flex justify-between pt-2">
                        <button
                            onClick={() => setViewMode('breakdown')}
                            className="text-gray-600 hover:text-gray-800 transition text-sm"
                        >
                            ← 返回分解步骤
                        </button>
                        <button
                            onClick={handleCreateSubtask}
                            disabled={!draftSubtask.title.trim()}
                            className="flex items-center bg-green-500 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-green-600 transition duration-150 disabled:bg-gray-400"
                        >
                            <Save className="w-5 h-5 mr-2"/> 确认并创建子任务
                        </button>
                    </div>
                </div>
            );
        }

        if (viewMode === 'breakdown') {
            return (
                <div className="space-y-4">
                    {llmError && (
                        <p className="p-3 bg-red-100 text-red-600 rounded-lg">LLM 调用失败: {llmError}</p>
                    )}
                    
                    <div className="p-4 border border-gray-200 rounded-lg bg-white">
                        <h3 className="text-lg font-semibold text-gray-700 mb-2">原始分解结果 (仅供参考):</h3>
                        <MarkdownRenderer content={generatedContent} />
                    </div>
                    
                    {subtaskCandidates.length > 0 && (
                        <div>
                            <h3 className="text-lg font-bold text-blue-600 mb-3">
                                💡 选择一个子步骤创建任务:
                            </h3>
                            <div className="space-y-2">
                                {subtaskCandidates.map((candidate, index) => (
                                    <button 
                                        key={index}
                                        onClick={() => handleSelectCandidate(candidate)}
                                        className="w-full text-left p-3 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition duration-150 flex justify-between items-center"
                                    >
                                        <span className="text-gray-800 font-medium">
                                            {candidate}
                                        </span>
                                        <span className="text-indigo-600 font-semibold text-sm">选择 →</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    <div className="flex justify-end pt-4">
                         <button
                            onClick={generateDetails}
                            disabled={isLoading}
                            className="flex items-center bg-blue-500 text-white font-semibold py-2 px-4 rounded-lg shadow-md hover:bg-blue-600 transition duration-150"
                        >
                            重新生成分解 ✨
                        </button>
                    </div>
                </div>
            );
        }
    }


    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center p-4 z-50">
            <div className="bg-gray-50 rounded-xl shadow-2xl w-full max-w-2xl p-6 animate-fade-in-up">
                <div className="flex justify-between items-start mb-4 border-b pb-3">
                    <h2 className="text-2xl font-bold text-blue-600 flex items-center">
                        <Zap className="w-6 h-6 mr-2"/> 任务分解：{task.title}
                    </h2>
                    <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200 transition">
                        <X className="w-6 h-6 text-gray-500" />
                    </button>
                </div>
                
                {renderContent()}
                
            </div>
        </div>
    );
};


// --- 3. 核心组件：任务新增模态窗口 (TaskModal) ---
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


// --- 4. 核心组件：任务列表项 (TaskItem) ---
const TaskItem = ({ task, updateTask, deleteTask, onExpandClick }) => {
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

            <div className="flex space-x-2 ml-4 items-center">
                
                {/* LLM 任务分解按钮 */}
                {!task.is_done && (
                    <button
                        onClick={() => onExpandClick(task)}
                        className="p-1.5 text-white bg-purple-500 rounded-full shadow-md hover:bg-purple-600 transition"
                        title="LLM 任务分解 ✨"
                    >
                        <Zap className="w-4 h-4" />
                    </button>
                )}

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


// --- 5. 主应用组件 (App) ---
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
    
    // LLM 扩展功能状态
    const [isExpandModalOpen, setIsExpandModalOpen] = useState(false);
    const [taskToExpand, setTaskToExpand] = useState(null);

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
                    console.error("Firebase 认证错误:", e);
                    setError("认证失败。请检查 Firebase 配置。");
                } finally {
                    setIsAuthReady(true);
                }
            };

            handleAuth();

            // 2. 监听 Auth 状态变化
            const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
                if (user) {
                    setUserId(user.uid);
                } else {
                    if (!userId) {
                         signInAnonymously(auth);
                    }
                }
            });

            return () => unsubscribeAuth();

        } catch (e) {
            console.error("Firebase 初始化错误:", e);
            setError("Firebase 初始化失败。");
        }
    }, []);

    // --- Firestore Realtime Listener ---
    useEffect(() => {
        // 核心守卫：在 DB 或用户ID未准备好之前，不执行查询
        if (!db || !userId || !isAuthReady) {
            return;
        }

        setLoading(true);
        setError('');
        
        let unsubscribe = () => {};

        try {
            const tasksRef = getTasksCollectionRef(db, userId);
            
            // 使用 where('groupId', '==', currentGroup) 进行过滤查询
            const q = query(
                tasksRef, 
                where('groupId', '==', currentGroup)
            );
            
            // 实时监听器
            unsubscribe = onSnapshot(q, (snapshot) => {
                const fetchedTasks = snapshot.docs.map(doc => ({
                    id: doc.id,
                    ...doc.data()
                }));
                
                // 在客户端（JavaScript）执行排序
                fetchedTasks.sort((a, b) => {
                    // 1. 按 is_done 排序：未完成 (false) 排在已完成 (true) 前面
                    if (a.is_done !== b.is_done) {
                        return a.is_done ? 1 : -1;
                    }
                    if (a.title < b.title) return -1;
                    if (a.title > b.title) return 1;
                    return 0;
                });

                setTasks(fetchedTasks);
                setLoading(false);
                setError(''); // 成功获取数据后清除旧错误
            }, (err) => {
                // 异步错误：例如安全规则被拒绝或网络问题
                console.error("Firestore 实时数据同步错误:", err);
                setError(`数据同步失败: ${err.message || '请检查网络或权限。'}`);
                setLoading(false);
            });

            return () => unsubscribe();
            
        } catch (e) {
            // 同步错误：例如 Firestore 函数未加载或参数错误
            console.error("Firestore 查询设置同步错误:", e);
            setError(`查询设置失败。请检查控制台了解详情。`);
            setLoading(false);
            return () => unsubscribe(); // 确保即使失败也尝试清理
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
                createdAt: new Date()
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
    
    // LLM 任务分解操作
    const handleExpandClick = (task) => { 
        setTaskToExpand(task); 
        setIsExpandModalOpen(true); 
    };


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

                {/* 错误提示框 */}
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
                            onExpandClick={handleExpandClick} // LLM 扩展功能
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
                            onExpandClick={handleExpandClick} // LLM 扩展功能
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

            {/* LLM 任务分解模态窗口 */}
            <ExpandTaskModal 
                isOpen={isExpandModalOpen} 
                onClose={() => setIsExpandModalOpen(false)} 
                task={taskToExpand}
                currentGroup={currentGroup}
                addTask={addTask} // 传递 addTask 函数用于创建子任务
            />
        </div>
    );
};

export default App;


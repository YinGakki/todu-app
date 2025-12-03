import React, { useState, useEffect, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { 
    getAuth, 
    signInWithEmailAndPassword, // 仅保留登录功能
    signOut,                        
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
    setLogLevel 
} from 'firebase/firestore';
import { 
    Plus, X, Check, Trash2, LayoutGrid, Zap, Edit3, Save, LogIn, LogOut 
} from 'lucide-react';

// 设置 Firebase 日志级别为 Debug
setLogLevel('debug');

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

// 辅助函数 (MarkdownRenderer 和 parseSubtaskCandidates 保持不变)
const MarkdownRenderer = ({ content }) => {
    const htmlContent = content
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') 
        .split('\n').map((line, index) => {
            const isListItem = line.trim().startsWith('* ') || line.trim().startsWith('- ') || /^\d+\./.test(line.trim());
            
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

const parseSubtaskCandidates = (content) => {
    const lines = content.split('\n');
    const candidates = [];
    const regex = /^\s*(\*|\-|\d+\.)\s*(.*?)$/;

    lines.forEach(line => {
        const match = line.match(regex);
        if (match) {
            let title = match[2].trim().replace(/\*\*(.*?)\*\*/g, '$1').trim();
            if (title.length > 0 && !title.includes('步骤') && !title.includes('资源')) {
                 candidates.push(title);
            }
        }
    });
    return candidates;
};


// --- 1. Firebase 初始化与全局配置 ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

// 使用私有路径存储任务
const getTasksCollectionRef = (db, userId) => {
    return collection(db, `artifacts/${appId}/users/${userId}/tasks`);
};

// 预定义任务组
const defaultGroups = ['个人', '工作', '家庭'];


// --- 2. 核心组件：认证表单 (AuthForm) - 纯登录模式 ---
const AuthForm = ({ auth, setError }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    // 强制只进行登录操作
    const handleLogin = async (e) => {
        e.preventDefault();
        
        // --- 调试代码开始 ---
        // 1. 检查按钮是否真的触发了事件
        alert("按钮点击成功！开始检查环境...");

        // 2. 检查 Firebase Auth 对象是否存在
        if (!auth) {
            alert("严重错误：Auth 对象为空！Firebase 未初始化成功。");
            return;
        }

        // 3. 检查 API Key 是否读取到了 (只显示前几位，防止泄露)
        const apiKey = import.meta.env.VITE_FIREBASE_API_KEY;
        alert(`读取到的 API Key: ${apiKey ? apiKey.slice(0, 5) + '...' : '未读取到 (undefined)'}`);
    
        if (!apiKey) {
            alert("环境配置错误：无法读取 API Key。请检查 Vercel 环境变量设置并重新部署！");
            return;
        }
        // --- 调试代码结束 ---
        
        setIsLoading(true);
        setError('');

        try {
            await signInWithEmailAndPassword(auth, email, password);
            console.debug("用户登录成功。");
            // 登录成功后，onAuthStateChanged 会更新 App 状态
        } catch (e) {
            console.error("登录操作失败:", e);
            let errorMessage = "登录失败，请检查邮箱和密码是否正确。";
            if (e.code) {
                switch (e.code) {
                    case 'auth/invalid-email':
                        errorMessage = '邮箱格式不正确。';
                        break;
                    case 'auth/user-not-found':
                    case 'auth/wrong-password':
                        errorMessage = '邮箱或密码错误，用户不存在或凭证不匹配。';
                        break;
                    case 'auth/too-many-requests':
                        errorMessage = '登录尝试过多，请稍后重试。';
                        break;
                    default:
                        errorMessage = `登录错误: ${e.code.replace('auth/', '')}`;
                }
            }
            setError(errorMessage);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="flex h-screen items-center justify-center bg-gray-50 p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm p-8 space-y-6">
                <h1 className="text-3xl font-bold text-center text-blue-600 flex items-center justify-center">
                    <LogIn className="w-7 h-7 mr-2"/> 用户登录
                </h1>
                <p className="text-center text-gray-500 text-sm">请输入您的注册邮箱和密码以继续</p>
                
                {/* 错误提示框 */}
                {setError && <div className="p-3 mb-4 bg-red-100 text-red-700 rounded-lg">{setError}</div>}

                <form onSubmit={handleLogin} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">邮箱 (Email)</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition"
                            placeholder="user@example.com"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">密码 (Password)</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full p-3 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 transition"
                            placeholder="输入密码"
                            required
                            minLength={6}
                        />
                    </div>

                    <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg shadow-md hover:bg-blue-700 transition duration-150 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                        {isLoading ? (
                            <div className="w-5 h-5 border-2 border-t-2 border-white rounded-full animate-spin"></div>
                        ) : (
                            '登录'
                        )}
                    </button>
                </form>
            </div>
        </div>
    );
};


// --- 3. 核心组件：任务分解模态窗口 (LLM 任务分解) ---
const ExpandTaskModal = ({ isOpen, onClose, task, currentGroup, addTask }) => {
    const [generatedContent, setGeneratedContent] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [llmError, setLlmError] = useState(null);
    const [subtaskCandidates, setSubtaskCandidates] = useState([]);
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
            setViewMode('breakdown'); 
        } finally {
            setIsLoading(false);
        }
    }, [task?.title, currentGroup]);

    useEffect(() => {
        if (isOpen && task) {
            if (generatedContent === '' && !isLoading) {
                generateDetails();
            }
        }
        if (!isOpen) {
            resetState();
        }
    }, [isOpen, task, generatedContent, isLoading, generateDetails]);
    
    const handleSelectCandidate = (candidateTitle) => {
        setDraftSubtask({ title: candidateTitle, importance: '普通' });
        setViewMode('draft');
    };
    
    const handleCreateSubtask = async () => {
        if (draftSubtask.title.trim()) {
            await addTask(draftSubtask.title, draftSubtask.importance);
            resetState();
            onClose();
        }
    };
    
    if (!isOpen || !task) return null;

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


// --- 4. 核心组件：任务新增模态窗口 (TaskModal) ---
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


// --- 5. 核心组件：任务列表项 (TaskItem) ---
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


// --- 6. 主应用组件 (App) ---
const App = () => {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null); 
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
        let unsubscribeAuth = () => {};
        
        try {
            // === 🔍 强力调试代码开始 ===
            // 1. 直接检查环境变量是否读取成功
            const envKey = import.meta.env.VITE_FIREBASE_API_KEY;
            
            // 如果读取失败，直接抛出错误，中止后续操作
            if (!envKey) {
                throw new Error("严重错误：无法读取 VITE_FIREBASE_API_KEY。\n原因是：环境变量未配置，或配置后未重新部署 (Redeploy)。");
            }

            // 2. 检查 Config 对象
            if (!firebaseConfig || !firebaseConfig.apiKey) {
                 throw new Error("严重错误：firebaseConfig 对象为空或缺少 apiKey。");
            }
            // === 🔍 强力调试代码结束 ===

            const app = initializeApp(firebaseConfig);
            const firestoreDb = getFirestore(app);
            const authInstance = getAuth(app);
            
            setDb(firestoreDb);
            setAuth(authInstance);

            // 监听 Auth 状态变化
            unsubscribeAuth = onAuthStateChanged(authInstance, (user) => {
                if (user) {
                    setUserId(user.uid);
                } else {
                    setUserId(null);
                    setTasks([]); 
                }
                setIsAuthReady(true);
                setLoading(false);
            });
            
            return () => unsubscribeAuth();

        } catch (e) {
            // 捕获所有初始化错误，并直接弹窗
            alert(`Firebase 初始化失败！\n\n错误信息：${e.message}`);
            console.error("Firebase initialization failed:", e);
            setError(`系统错误: ${e.message}`);
            setIsAuthReady(true);
            setLoading(false);
        }
    }, []);

    // --- Firestore Realtime Listener ---
    useEffect(() => {
        // 核心守卫：在 DB 或用户ID未准备好之前，不执行查询
        if (!db || !userId || !isAuthReady) {
            console.debug("Firestore 监听器等待 DB/UserID/AuthReady...");
            return;
        }
        
        setLoading(true);
        setError('');
        
        let unsubscribe = () => {};

        try {
            const tasksRef = getTasksCollectionRef(db, userId);
            
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
                
                fetchedTasks.sort((a, b) => {
                    if (a.is_done !== b.is_done) {
                        return a.is_done ? 1 : -1;
                    }
                    if (a.title < b.title) return -1;
                    if (a.title > b.title) return 1;
                    return 0;
                });

                setTasks(fetchedTasks);
                setLoading(false);
                setError('');
                console.debug("任务数据已同步。");
            }, (err) => {
                console.error("Firestore 实时数据同步错误:", err);
                setError(`数据同步失败: ${err.message || '请检查网络或权限。'}`);
                setLoading(false);
            });

            return () => unsubscribe();
            
        } catch (e) {
            console.error("Firestore 查询设置同步错误:", e);
            setError(`查询设置失败。请检查控制台了解详情。`);
            setLoading(false);
            return () => unsubscribe();
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
    
    // 登出函数
    const handleSignOut = async () => {
        if (!auth) return;
        try {
            await signOut(auth);
            setError('');
            console.debug("用户成功登出。");
        } catch (e) {
            console.error("登出失败:", e);
            setError("登出操作失败。");
        }
    };
    
    // LLM 任务分解操作
    const handleExpandClick = (task) => { 
        setTaskToExpand(task); 
        setIsExpandModalOpen(true); 
    };


    // --- 渲染逻辑 ---

    if (!isAuthReady) {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-50">
                <div className="text-xl text-gray-600">正在检查认证状态...</div>
            </div>
        );
    }
    
    // 如果用户未登录，显示认证表单 (纯登录模式)
    if (!userId) {
        return <AuthForm auth={auth} setError={setError} />;
    }

    // 用户已登录，显示主应用界面
    const pendingTasks = tasks.filter(t => !t.is_done);
    const completedTasks = tasks.filter(t => t.is_done);

    return (
        <div className="min-h-screen bg-gray-50 pb-20 relative">
            
            {/* 顶部标题和分组选择器 */}
            <header className="bg-white shadow-md p-4 sticky top-0 z-40 flex justify-between items-center">
                <h1 className="text-xl sm:text-2xl font-extrabold text-blue-600 flex items-center">
                    <LayoutGrid className="w-6 h-6 mr-2" /> 任务管理器
                </h1>
                
                {/* 右侧控制区 */}
                <div className="flex items-center space-x-2">
                     {/* 分组切换按钮 */}
                    <select
                        value={currentGroup}
                        onChange={(e) => setCurrentGroup(e.target.value)}
                        className="p-2 border border-gray-300 rounded-lg bg-white text-gray-700 font-medium transition text-sm"
                        title="切换任务分组"
                    >
                        {defaultGroups.map(group => (
                            <option key={group} value={group}>{group}</option>
                        ))}
                    </select>

                    {/* 登出按钮 */}
                    <button
                        onClick={handleSignOut}
                        className="p-2 bg-red-500 text-white rounded-lg shadow-md hover:bg-red-600 transition duration-150 flex items-center"
                        title="登出"
                    >
                        <LogOut className="w-5 h-5" />
                    </button>
                </div>
            </header>
            
            <div className="p-4 sm:p-6 max-w-2xl mx-auto">
                {/* 用户信息和错误/加载状态 */}
                <div className="mb-4 text-sm text-gray-500 p-3 bg-white rounded-lg shadow">
                    当前用户ID: <code className="break-all text-xs">{userId}</code>
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
                            onExpandClick={handleExpandClick} 
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
                            onExpandClick={handleExpandClick} 
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
                addTask={addTask} 
            />
        </div>
    );
};

export default App;


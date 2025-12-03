import React, { useState, useEffect, useRef, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth';
import { 
    getFirestore, collection, query, where, onSnapshot, 
    doc, setDoc, addDoc, deleteDoc, updateDoc, getDoc 
} from 'firebase/firestore';
import { 
    Plus, X, Check, Trash2, LayoutGrid, LogOut, 
    Sun, Moon, Calendar, ChevronDown, ChevronRight,
    Edit2, Settings, MoreHorizontal, FolderPlus, Layers
} from 'lucide-react';

// --- 1. 配置与工具函数 ---
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID
};
const appId = firebaseConfig.appId || 'default-app-id';

// 颜色工具：生成同色系的随机变体（用于边框）
const generateVariantColor = (hexColor) => {
    // 简单的转换逻辑，实际项目中可以使用 chroma-js
    // 这里简单地返回原色，配合 CSS opacity 实现变体
    return hexColor; 
};

// 北京时间判断
const isBeijingNight = () => {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const beijingTime = new Date(utc + (3600000 * 8));
    const hour = beijingTime.getHours();
    return hour >= 19 || hour < 8;
};

// --- 2. 登录组件 ---
const AuthForm = ({ auth, error, setError }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        setIsLoading(true);
        try {
            await signInWithEmailAndPassword(auth, email, password);
        } catch (e) {
            setError('登录失败：' + e.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl w-full max-w-sm p-8 space-y-6 text-white">
                <h1 className="text-3xl font-bold text-center bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">Task Pro</h1>
                {error && <div className="p-3 bg-red-500/50 rounded-lg text-sm">{error}</div>}
                <form onSubmit={handleLogin} className="space-y-4">
                    <input type="email" value={email} onChange={e=>setEmail(e.target.value)} className="w-full p-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:border-blue-500 outline-none" placeholder="Email" required/>
                    <input type="password" value={password} onChange={e=>setPassword(e.target.value)} className="w-full p-3 bg-black/30 border border-white/10 rounded-xl text-white placeholder-gray-400 focus:border-blue-500 outline-none" placeholder="Password" required/>
                    <button type="submit" disabled={isLoading} className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold transition shadow-lg shadow-blue-500/30">{isLoading ? 'Loading...' : 'Sign In'}</button>
                </form>
            </div>
        </div>
    );
};

// --- 3. 增强型任务组件 (滑动 + 进度背景) ---
const TaskItem = ({ task, updateTask, deleteTask, groupColor }) => {
    const [startX, setStartX] = useState(0);
    const [offsetX, setOffsetX] = useState(0);
    const [isSwiped, setIsSwiped] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState(task.title);
    const [newSubtask, setNewSubtask] = useState('');
    const [showSubInput, setShowSubInput] = useState(false);

    // 触摸/鼠标事件处理滑动
    const handleTouchStart = (e) => setStartX(e.touches ? e.touches[0].clientX : e.clientX);
    
    const handleTouchMove = (e) => {
        if (isEditing) return;
        const currentX = e.touches ? e.touches[0].clientX : e.clientX;
        const diff = currentX - startX;
        if (diff < 0 && diff > -150) setOffsetX(diff); // 向左滑
    };

    const handleTouchEnd = () => {
        if (offsetX < -60) {
            setOffsetX(-120); // 锁定展开状态
            setIsSwiped(true);
        } else {
            setOffsetX(0);
            setIsSwiped(false);
        }
    };

    // 子任务逻辑
    const subtasks = task.subtasks || [];
    const doneCount = subtasks.filter(s => s.is_done).length;
    const totalCount = subtasks.length;
    const progress = totalCount > 0 ? (doneCount / totalCount) * 100 : 0;
    
    // 背景样式生成
    const getBackgroundStyle = () => {
        if (task.is_done) return { background: groupColor, opacity: 0.8 }; // 完成全填充
        
        if (totalCount > 0) {
            // 进度条背景
            return {
                background: `linear-gradient(90deg, ${groupColor}40 ${progress}%, transparent ${progress}%)`,
                backgroundSize: '100% 100%'
            };
        }
        return {}; // 默认无背景
    };

    // 边框颜色 (根据组主题，随机微调透明度或明暗很难在行内style完美做，这里用透明度模拟)
    const borderColor = groupColor || '#cbd5e1'; 

    const handleSaveEdit = () => {
        updateTask(task.id, { title: editTitle });
        setIsEditing(false);
        setOffsetX(0);
        setIsSwiped(false);
    };

    return (
        <li className="relative mb-3 overflow-hidden rounded-xl select-none group">
            {/* 底部操作按钮层 */}
            <div className="absolute inset-y-0 right-0 w-[120px] flex">
                <button onClick={() => setIsEditing(true)} className="flex-1 bg-blue-500 text-white flex items-center justify-center">
                    <Edit2 className="w-5 h-5" />
                </button>
                <button onClick={() => deleteTask(task.id)} className="flex-1 bg-red-500 text-white flex items-center justify-center">
                    <Trash2 className="w-5 h-5" />
                </button>
            </div>

            {/* 上层内容层 (可滑动) */}
            <div 
                className={`
                    relative p-4 bg-white dark:bg-gray-800 border-l-4 transition-transform duration-200 ease-out
                    ${task.is_done ? 'text-gray-500' : 'text-gray-800 dark:text-gray-100'}
                    task-bg-transition shadow-sm
                `}
                style={{ 
                    transform: `translateX(${offsetX}px)`,
                    borderLeftColor: borderColor,
                    ...getBackgroundStyle()
                }}
                onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}
                onMouseDown={handleTouchStart} onMouseMove={(e) => startX && handleTouchMove(e)} onMouseUp={() => { setStartX(0); handleTouchEnd(); }} onMouseLeave={() => { setStartX(0); handleTouchEnd(); }}
            >
                {/* 任务主体 */}
                <div className="flex items-start justify-between">
                    <div className="flex items-center flex-1 overflow-hidden">
                        <div 
                            onClick={(e) => { e.stopPropagation(); updateTask(task.id, { is_done: !task.is_done }); }}
                            className={`w-6 h-6 rounded-full border-2 mr-3 flex items-center justify-center cursor-pointer transition-colors ${task.is_done ? 'bg-white border-white' : 'border-gray-400'}`}
                            style={task.is_done ? {color: groupColor} : {}}
                        >
                            {task.is_done && <Check className="w-4 h-4" />}
                        </div>

                        <div className="flex-1">
                            {isEditing ? (
                                <div className="flex items-center">
                                    <input autoFocus value={editTitle} onChange={e=>setEditTitle(e.target.value)} className="bg-white/50 dark:bg-black/20 p-1 rounded w-full" />
                                    <button onClick={handleSaveEdit} className="ml-2 text-green-600"><Check/></button>
                                </div>
                            ) : (
                                <div>
                                    <span className={`text-lg font-medium ${task.is_done ? 'line-through' : ''}`}>{task.title}</span>
                                    {/* 显示截止日期 */}
                                    {(task.dueDate || showSubInput) && (
                                        <div className="flex items-center mt-1 space-x-2 text-xs text-gray-400">
                                            {task.dueDate && (
                                                <span className={`flex items-center ${new Date(task.dueDate) < new Date() && !task.is_done ? 'text-red-500' : ''}`}>
                                                    <Calendar className="w-3 h-3 mr-1" /> {task.dueDate}
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* 右侧：截止日期设置 + 展开子任务 */}
                    <div className="flex items-center space-x-2 ml-2">
                        <div className="relative group/date p-1">
                            <Calendar className="w-5 h-5 text-gray-400 hover:text-blue-500" />
                            <input 
                                type="date" 
                                className="absolute inset-0 opacity-0 cursor-pointer"
                                onChange={(e) => updateTask(task.id, { dueDate: e.target.value })}
                            />
                        </div>
                        <button onClick={() => setShowSubInput(!showSubInput)} className="p-1 text-gray-400 hover:text-blue-500">
                            {showSubInput || subtasks.length > 0 ? <ChevronDown className="w-5 h-5" /> : <Plus className="w-5 h-5"/>}
                        </button>
                    </div>
                </div>

                {/* 子任务区域 */}
                {(showSubInput || subtasks.length > 0) && (
                    <div className="mt-3 pl-9 space-y-2 animate-slide-in">
                        {subtasks.map((sub) => (
                            <div key={sub.id} className="flex items-center justify-between text-sm group/sub">
                                <div onClick={() => {
                                    const newSubs = subtasks.map(s => s.id === sub.id ? { ...s, is_done: !s.is_done } : s);
                                    updateTask(task.id, { subtasks: newSubs });
                                }} className="flex items-center cursor-pointer flex-1">
                                    <div className={`w-3 h-3 border rounded mr-2 ${sub.is_done ? 'bg-gray-500 border-gray-500' : 'border-gray-400'}`}></div>
                                    <span className={sub.is_done ? 'line-through opacity-50' : ''}>{sub.title}</span>
                                    {sub.dueDate && <span className="text-xs text-gray-400 ml-2">({sub.dueDate})</span>}
                                </div>
                                
                                <div className="flex items-center space-x-2 opacity-0 group-hover/sub:opacity-100 transition-opacity">
                                     <div className="relative w-4 h-4">
                                        <Calendar className="w-4 h-4 text-gray-300 hover:text-blue-500" />
                                        <input type="date" className="absolute inset-0 opacity-0" onChange={(e) => {
                                            const newSubs = subtasks.map(s => s.id === sub.id ? { ...s, dueDate: e.target.value } : s);
                                            updateTask(task.id, { subtasks: newSubs });
                                        }}/>
                                    </div>
                                    <button onClick={() => {
                                        const newSubs = subtasks.filter(s => s.id !== sub.id);
                                        updateTask(task.id, { subtasks: newSubs });
                                    }}><X className="w-3 h-3 text-red-400" /></button>
                                </div>
                            </div>
                        ))}
                        
                        <div className="flex items-center mt-2">
                            <input 
                                type="text" 
                                placeholder="添加子任务..."
                                className="flex-1 bg-transparent border-b border-gray-200 dark:border-gray-700 text-sm py-1 focus:outline-none dark:text-gray-200"
                                value={newSubtask}
                                onChange={e => setNewSubtask(e.target.value)}
                                onKeyDown={e => {
                                    if(e.key === 'Enter' && newSubtask.trim()) {
                                        const newSub = { id: Date.now().toString(), title: newSubtask, is_done: false };
                                        updateTask(task.id, { subtasks: [...subtasks, newSub] });
                                        setNewSubtask('');
                                    }
                                }}
                            />
                        </div>
                    </div>
                )}
            </div>
        </li>
    );
};

// --- 4. 列表/组管理弹窗 ---
const ListManager = ({ isOpen, onClose, lists, currentListId, setLists, userId, db }) => {
    const [editMode, setEditMode] = useState(false);
    const [newList, setNewList] = useState('');
    const [newGroup, setNewGroup] = useState({ name: '', color: '#3b82f6' });
    const [activeListId, setActiveListId] = useState(currentListId);

    // 同步到 Firestore
    const saveLists = async (updatedLists) => {
        setLists(updatedLists);
        await setDoc(doc(db, `artifacts/${appId}/users/${userId}/settings/config`), { lists: updatedLists }, { merge: true });
    };

    const addList = () => {
        if (!newList.trim()) return;
        const newItem = { id: Date.now().toString(), name: newList, groups: [] };
        saveLists([...lists, newItem]);
        setNewList('');
    };

    const addGroup = (listId) => {
        if (!newGroup.name.trim()) return;
        const updatedLists = lists.map(l => {
            if (l.id === listId) {
                return { 
                    ...l, 
                    groups: [...(l.groups || []), { id: Date.now().toString(), name: newGroup.name, color: newGroup.color }] 
                };
            }
            return l;
        });
        saveLists(updatedLists);
        setNewGroup({ name: '', color: '#3b82f6' });
    };

    const deleteList = (id) => saveLists(lists.filter(l => l.id !== id));
    
    const deleteGroup = (listId, groupId) => {
        const updatedLists = lists.map(l => {
            if (l.id === listId) {
                return { ...l, groups: l.groups.filter(g => g.id !== groupId) };
            }
            return l;
        });
        saveLists(updatedLists);
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg h-[80vh] flex flex-col shadow-2xl overflow-hidden">
                <div className="p-4 border-b dark:border-gray-700 flex justify-between items-center">
                    <h2 className="text-xl font-bold dark:text-white">管理列表与组</h2>
                    <button onClick={onClose}><X className="w-6 h-6 text-gray-500"/></button>
                </div>
                
                <div className="flex flex-1 overflow-hidden">
                    {/* 左侧：列表清单 */}
                    <div className="w-1/3 border-r dark:border-gray-700 bg-gray-50 dark:bg-gray-800 p-2 overflow-y-auto">
                        <div className="space-y-1">
                            {lists.map(list => (
                                <div key={list.id} 
                                    onClick={() => setActiveListId(list.id)}
                                    className={`p-2 rounded cursor-pointer flex justify-between items-center text-sm ${activeListId === list.id ? 'bg-blue-100 dark:bg-blue-900 text-blue-600' : 'hover:bg-gray-200 dark:hover:bg-gray-700 dark:text-gray-300'}`}
                                >
                                    <span className="truncate">{list.name}</span>
                                    {editMode && <button onClick={(e)=>{e.stopPropagation(); deleteList(list.id)}}><X className="w-3 h-3 text-red-500"/></button>}
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 pt-4 border-t dark:border-gray-700">
                            <input value={newList} onChange={e=>setNewList(e.target.value)} placeholder="新列表名" className="w-full text-xs p-1 mb-1 rounded border dark:bg-gray-700 dark:border-gray-600 dark:text-white"/>
                            <button onClick={addList} className="w-full bg-blue-500 text-white text-xs py-1 rounded">添加列表</button>
                            <button onClick={()=>setEditMode(!editMode)} className="w-full mt-2 text-gray-400 text-xs">{editMode?'退出编辑':'管理列表'}</button>
                        </div>
                    </div>

                    {/* 右侧：组清单 */}
                    <div className="flex-1 p-4 bg-white dark:bg-gray-900 overflow-y-auto">
                        <h3 className="font-bold mb-4 dark:text-gray-200">
                            {lists.find(l=>l.id===activeListId)?.name || '请选择列表'} 的分组
                        </h3>
                        
                        <div className="grid grid-cols-2 gap-3 mb-6">
                            {lists.find(l=>l.id===activeListId)?.groups?.map(group => (
                                <div key={group.id} className="flex items-center p-2 rounded border dark:border-gray-700 shadow-sm" style={{borderLeft: `4px solid ${group.color}`}}>
                                    <span className="flex-1 text-sm dark:text-gray-300">{group.name}</span>
                                    {editMode && <button onClick={()=>deleteGroup(activeListId, group.id)}><X className="w-4 h-4 text-red-400"/></button>}
                                </div>
                            ))}
                        </div>

                        {activeListId && (
                            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-xl border dark:border-gray-700">
                                <p className="text-xs text-gray-500 mb-2">添加新组</p>
                                <div className="flex space-x-2 mb-2">
                                    <input value={newGroup.name} onChange={e=>setNewGroup({...newGroup, name: e.target.value})} placeholder="组名称 (如: 紧急)" className="flex-1 p-2 rounded border text-sm dark:bg-gray-700 dark:text-white"/>
                                    <input type="color" value={newGroup.color} onChange={e=>setNewGroup({...newGroup, color: e.target.value})} className="w-10 h-9 p-0 rounded cursor-pointer"/>
                                </div>
                                <button onClick={()=>addGroup(activeListId)} className="w-full bg-blue-600 text-white py-2 rounded text-sm">创建组</button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- 5. 主程序 ---
const App = () => {
    const [db, setDb] = useState(null);
    const [auth, setAuth] = useState(null);
    const [userId, setUserId] = useState(null);
    const [error, setError] = useState('');
    
    // 数据 State
    const [lists, setLists] = useState([{ id: 'default', name: '默认列表', groups: [{id: 'g1', name: '默认', color: '#6366f1'}] }]);
    const [currentListId, setCurrentListId] = useState('default');
    const [tasks, setTasks] = useState([]);
    
    // UI State
    const [themeMode, setThemeMode] = useState('auto'); // 'light', 'dark', 'auto'
    const [showCompleted, setShowCompleted] = useState(false);
    const [isListManagerOpen, setIsListManagerOpen] = useState(false);
    const [isTaskCreatorOpen, setIsTaskCreatorOpen] = useState(false);
    
    // 新任务 Form
    const [newTask, setNewTask] = useState({ title: '', groupId: '' });

    // 初始化 Firebase
    useEffect(() => {
        try {
            const app = initializeApp(firebaseConfig);
            setDb(getFirestore(app));
            setAuth(getAuth(app));
            onAuthStateChanged(getAuth(app), (user) => setUserId(user ? user.uid : null));
        } catch (e) { console.error(e); setError('Firebase Init Error'); }
    }, []);

    // 监听列表配置
    useEffect(() => {
        if (!db || !userId) return;
        const configRef = doc(db, `artifacts/${appId}/users/${userId}/settings/config`);
        getDoc(configRef).then(snap => {
            if(snap.exists() && snap.data().lists) {
                setLists(snap.data().lists);
                setCurrentListId(snap.data().lists[0].id);
            }
        });
    }, [db, userId]);

    // 监听任务
    useEffect(() => {
        if (!db || !userId) return;
        const q = query(collection(db, `artifacts/${appId}/users/${userId}/tasks`), where('listId', '==', currentListId));
        return onSnapshot(q, (snapshot) => {
            setTasks(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
    }, [db, userId, currentListId]);

    // 主题逻辑
    useEffect(() => {
        const applyTheme = () => {
            const root = document.documentElement;
            const isDark = themeMode === 'dark' || (themeMode === 'auto' && isBeijingNight());
            isDark ? root.classList.add('dark') : root.classList.remove('dark');
        };
        applyTheme();
        const t = setInterval(applyTheme, 60000);
        return () => clearInterval(t);
    }, [themeMode]);

    // 操作
    const handleAddTask = async (e) => {
        e.preventDefault();
        if (!newTask.title.trim()) return;
        // 默认取当前列表的第一个组
        const targetGroupId = newTask.groupId || lists.find(l=>l.id===currentListId)?.groups[0]?.id;
        
        await addDoc(collection(db, `artifacts/${appId}/users/${userId}/tasks`), {
            title: newTask.title,
            is_done: false,
            listId: currentListId,
            groupId: targetGroupId,
            subtasks: [],
            createdAt: new Date()
        });
        setNewTask({ title: '', groupId: '' });
        setIsTaskCreatorOpen(false);
    };

    const updateTask = async (id, data) => updateDoc(doc(db, `artifacts/${appId}/users/${userId}/tasks`, id), data);
    const deleteTask = async (id) => deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/tasks`, id));

    if (!userId) return <AuthForm auth={auth} error={error} setError={setError} />;

    // 计算衍生数据
    const currentList = lists.find(l => l.id === currentListId) || lists[0];
    const pendingTasks = tasks.filter(t => !t.is_done).sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
    const completedTasks = tasks.filter(t => t.is_done);

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-500 overflow-x-hidden">
            {/* 顶部导航 */}
            <header className="sticky top-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b dark:border-gray-800 p-4 flex justify-between items-center">
                
                {/* 左侧：列表选择 */}
                <div className="flex items-center space-x-2">
                    <div className="relative group">
                        <button className="flex items-center space-x-2 text-xl font-bold dark:text-white hover:opacity-70 transition">
                            <Layers className="w-6 h-6 text-blue-600"/>
                            <span>{currentList?.name}</span>
                            <ChevronDown className="w-4 h-4 text-gray-400"/>
                        </button>
                        {/* 下拉菜单 */}
                        <div className="absolute top-full left-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-xl shadow-xl border dark:border-gray-700 overflow-hidden hidden group-hover:block animate-fade-in">
                            {lists.map(list => (
                                <button key={list.id} onClick={()=>setCurrentListId(list.id)} className="w-full text-left px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 text-sm dark:text-gray-200">
                                    {list.name}
                                </button>
                            ))}
                            <div className="border-t dark:border-gray-700">
                                <button onClick={()=>setIsListManagerOpen(true)} className="w-full text-left px-4 py-3 text-blue-500 text-xs flex items-center hover:bg-gray-50 dark:hover:bg-gray-700">
                                    <Settings className="w-3 h-3 mr-2"/> 管理列表
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 右侧：主题与设置 */}
                <div className="flex items-center space-x-4">
                    {/* 双按钮主题切换 */}
                    <div className="flex bg-gray-200 dark:bg-gray-800 rounded-full p-1 relative">
                        <button 
                            onClick={() => setThemeMode(themeMode === 'light' ? 'auto' : 'light')}
                            className={`p-1.5 rounded-full transition-all z-10 ${themeMode === 'light' ? 'bg-white text-orange-500 shadow-md' : 'text-gray-400'} ${themeMode === 'auto' && 'text-yellow-600'}`}
                        >
                            <Sun className="w-4 h-4" />
                        </button>
                        <button 
                            onClick={() => setThemeMode(themeMode === 'dark' ? 'auto' : 'dark')}
                            className={`p-1.5 rounded-full transition-all z-10 ${themeMode === 'dark' ? 'bg-gray-600 text-white shadow-md' : 'text-gray-400'} ${themeMode === 'auto' && 'text-blue-400'}`}
                        >
                            <Moon className="w-4 h-4" />
                        </button>
                        {/* Auto 模式指示器 */}
                        {themeMode === 'auto' && (
                            <div className="absolute inset-0 border-2 border-blue-500/30 rounded-full pointer-events-none animate-pulse"></div>
                        )}
                    </div>

                    <button onClick={() => signOut(auth)} className="text-gray-400 hover:text-red-500"><LogOut className="w-5 h-5"/></button>
                </div>
            </header>

            <main className="max-w-3xl mx-auto p-4 pb-24">
                {/* 待办列表 */}
                <div className="space-y-4 min-h-[50vh]">
                    {pendingTasks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-20 opacity-50">
                            <FolderPlus className="w-16 h-16 text-gray-300 dark:text-gray-700 mb-4"/>
                            <p className="text-gray-500">空空如也，添加个任务吧！</p>
                        </div>
                    ) : (
                        <ul>
                            {pendingTasks.map(task => {
                                const group = currentList.groups?.find(g => g.id === task.groupId);
                                return (
                                    <TaskItem 
                                        key={task.id} 
                                        task={task} 
                                        updateTask={updateTask} 
                                        deleteTask={deleteTask} 
                                        groupColor={group?.color}
                                    />
                                );
                            })}
                        </ul>
                    )}
                </div>

                {/* 已完成 (可折叠) */}
                {completedTasks.length > 0 && (
                    <div className="mt-8 border-t dark:border-gray-800 pt-4">
                        <button 
                            onClick={() => setShowCompleted(!showCompleted)} 
                            className="flex items-center text-sm font-bold text-gray-500 dark:text-gray-400 hover:text-gray-800 transition"
                        >
                            {showCompleted ? <ChevronDown className="w-4 h-4 mr-1"/> : <ChevronRight className="w-4 h-4 mr-1"/>}
                            已完成 ({completedTasks.length})
                        </button>
                        
                        {showCompleted && (
                            <ul className="mt-4 opacity-70">
                                {completedTasks.map(task => {
                                    const group = currentList.groups?.find(g => g.id === task.groupId);
                                    return (
                                        <TaskItem 
                                            key={task.id} 
                                            task={task} 
                                            updateTask={updateTask} 
                                            deleteTask={deleteTask} 
                                            groupColor={group?.color}
                                        />
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                )}
            </main>

            {/* 底部 FAB 和创建栏 */}
            {isTaskCreatorOpen ? (
                <div className="fixed inset-x-0 bottom-0 bg-white dark:bg-gray-800 shadow-[0_-5px_20px_rgba(0,0,0,0.1)] p-4 rounded-t-2xl z-50 animate-slide-in">
                    <form onSubmit={handleAddTask}>
                        <div className="flex items-center space-x-2 mb-4 overflow-x-auto pb-2">
                            {/* 组选择器 Chips */}
                            {currentList.groups?.map(g => (
                                <button 
                                    type="button"
                                    key={g.id}
                                    onClick={() => setNewTask({...newTask, groupId: g.id})}
                                    className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap transition border ${newTask.groupId === g.id ? 'bg-gray-800 text-white' : 'bg-gray-100 text-gray-600 border-transparent dark:bg-gray-700 dark:text-gray-300'}`}
                                    style={newTask.groupId === g.id ? {backgroundColor: g.color, borderColor: g.color} : {}}
                                >
                                    {g.name}
                                </button>
                            ))}
                            <button type="button" onClick={()=>setIsListManagerOpen(true)} className="p-1 rounded-full bg-gray-100 dark:bg-gray-700"><Plus className="w-4 h-4"/></button>
                        </div>
                        <div className="flex gap-2">
                            <input 
                                autoFocus
                                value={newTask.title} 
                                onChange={e=>setNewTask({...newTask, title: e.target.value})} 
                                placeholder="输入任务..." 
                                className="flex-1 bg-gray-50 dark:bg-gray-900 border-none rounded-xl p-3 focus:ring-2 ring-blue-500 outline-none dark:text-white"
                            />
                            <button type="submit" className="bg-blue-600 text-white p-3 rounded-xl"><Check/></button>
                            <button type="button" onClick={()=>setIsTaskCreatorOpen(false)} className="bg-gray-200 dark:bg-gray-700 p-3 rounded-xl"><X/></button>
                        </div>
                    </form>
                </div>
            ) : (
                <button 
                    onClick={() => setIsTaskCreatorOpen(true)}
                    className="fixed bottom-6 right-6 p-4 bg-blue-600 text-white rounded-full shadow-2xl hover:bg-blue-700 transition transform hover:scale-105 active:scale-95 z-40"
                >
                    <Plus className="w-7 h-7" />
                </button>
            )}

            {/* 列表管理器弹窗 */}
            <ListManager 
                isOpen={isListManagerOpen} 
                onClose={() => setIsListManagerOpen(false)} 
                lists={lists} 
                currentListId={currentListId}
                setLists={setLists}
                userId={userId}
                db={db}
            />
        </div>
    );
};

export default App;

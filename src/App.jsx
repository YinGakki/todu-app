import React, { useState, useEffect, useCallback } from 'react';
import { 
    Plus, X, Check, Trash2, LayoutGrid, LogOut, 
    Sun, Moon, Calendar, Clock, ChevronDown, ChevronRight,
    Edit2, Settings, Layers, AlarmClock, Lock
} from 'lucide-react';

// --- 工具函数 ---
const PRESET_COLORS = ['#ef4444', '#f97316', '#f59e0b', '#84cc16', '#10b981', '#06b6d4', '#3b82f6', '#6366f1', '#d946ef', '#f43f5e'];

const isBeijingNight = () => { 
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const beijingTime = new Date(utc + (3600000 * 8));
    const hour = beijingTime.getHours();
    return hour >= 19 || hour < 8;
};

const formatSmartDate = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const isToday = date.getDate() === now.getDate() && date.getMonth() === now.getMonth();
    const h = date.getHours().toString().padStart(2, '0');
    const min = date.getMinutes().toString().padStart(2, '0');
    return isToday ? `今天 ${h}:${min}` : `${(date.getMonth() + 1)}/${date.getDate()} ${h}:${min}`;
};

const toInputFormat = (isoString) => isoString ? isoString.substring(0, 16) : '';

// --- API 交互层 ---
const api = {
    // 1. 任务相关
    fetchTasks: async (key) => {
        const res = await fetch('/api/tasks', { headers: { 'x-auth-key': key } });
        if (res.status === 401) throw new Error('AUTH_FAILED');
        return await res.json();
    },
    addTask: async (key, task) => fetch('/api/tasks', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-auth-key': key }, body: JSON.stringify(task) }),
    updateTask: async (key, id, updates) => fetch(`/api/tasks?id=${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json', 'x-auth-key': key }, body: JSON.stringify(updates) }),
    deleteTask: async (key, id) => fetch(`/api/tasks?id=${id}`, { method: 'DELETE', headers: { 'x-auth-key': key } }),

    // 2. 列表/组配置相关 (新增)
    fetchLists: async (key) => {
        const res = await fetch('/api/lists', { headers: { 'x-auth-key': key } });
        if (res.status === 401) throw new Error('AUTH_FAILED');
        const data = await res.json();
        return data; 
    },
    saveLists: async (key, lists) => {
        await fetch('/api/lists', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-auth-key': key },
            body: JSON.stringify(lists)
        });
    }
};

// --- 组件部分 ---

const AuthForm = ({ onLogin, error }) => {
    const [key, setKey] = useState('');
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900 p-4">
            <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-3xl w-full max-w-sm p-8 space-y-6 text-white text-center">
                <div className="bg-blue-500/20 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 animate-bounce">
                    <Lock className="w-8 h-8 text-blue-400" />
                </div>
                <h1 className="text-2xl font-bold">Cloud Task</h1>
                <p className="text-sm text-gray-400">请输入访问密钥 (默认: 123456)</p>
                {error && <div className="p-2 bg-red-500/50 rounded text-xs">{error}</div>}
                <form onSubmit={(e) => { e.preventDefault(); onLogin(key); }} className="space-y-4">
                    <input type="password" value={key} onChange={e=>setKey(e.target.value)} className="w-full p-3 bg-black/30 border border-white/10 rounded-xl text-center tracking-widest text-white outline-none focus:border-blue-500 transition" placeholder="ACCESS KEY" autoFocus/>
                    <button type="submit" className="w-full py-3 bg-blue-600 hover:bg-blue-500 rounded-xl font-bold transition">进入系统</button>
                </form>
            </div>
        </div>
    );
};

const DateBadge = ({ date, onChange, isDone }) => {
    const isOverdue = date && new Date(date) < new Date() && !isDone;
    return (
        <div className={`relative flex items-center justify-center transition-all duration-300 ${date ? (isOverdue ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : 'bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400') : 'bg-gray-100 text-gray-400 dark:bg-gray-800 dark:text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700'} ${date ? 'px-3 py-1.5 rounded-full' : 'p-2 rounded-lg'}`}>
            {date ? <><Clock className={`w-3.5 h-3.5 mr-1.5 ${isOverdue ? 'animate-pulse' : ''}`} /><span className="text-xs font-bold whitespace-nowrap">{formatSmartDate(date)}</span></> : <Calendar className="w-5 h-5" />}
            <input type="datetime-local" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" value={toInputFormat(date)} onChange={onChange}/>
        </div>
    );
};

const ColorPicker = ({ selectedColor, onSelect }) => (
    <div className="space-y-3">
        <div className="grid grid-cols-5 gap-3">
            {PRESET_COLORS.map(color => (
                <button
                    key={color}
                    type="button"
                    onClick={() => onSelect(color)}
                    className={`w-8 h-8 rounded-full transition-all duration-200 border-2 shadow-sm ${selectedColor === color ? 'border-gray-600 dark:border-white scale-110' : 'border-transparent hover:scale-105'}`}
                    style={{ backgroundColor: color }}
                />
            ))}
        </div>
        <div className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-800 p-2 rounded-lg">
             <input type="color" value={selectedColor} onChange={(e) => onSelect(e.target.value)} className="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent"/>
             <span className="text-xs text-gray-500">自定义</span>
        </div>
    </div>
);

const ListManager = ({ isOpen, onClose, lists, currentListId, setLists, authKey }) => {
    const [editMode, setEditMode] = useState(false);
    const [newList, setNewList] = useState('');
    const [newGroup, setNewGroup] = useState({ name: '', color: '#3b82f6' });
    const [activeListId, setActiveListId] = useState(currentListId);

    // ✅ 修改：保存到云端 API
    const updateLists = async (newLists) => {
        setLists(newLists);
        try {
            await api.saveLists(authKey, newLists);
        } catch (e) {
            console.error("Save lists failed", e);
            alert("同步配置失败，请检查网络");
        }
    };

    const addList = () => { if (newList.trim()) { updateLists([...lists, { id: Date.now().toString(), name: newList, groups: [] }]); setNewList(''); }};
    const addGroup = (listId) => { if (newGroup.name.trim()) { const updated = lists.map(l => l.id === listId ? { ...l, groups: [...(l.groups || []), { id: Date.now().toString(), name: newGroup.name, color: newGroup.color }] } : l); updateLists(updated); setNewGroup({ name: '', color: '#3b82f6' }); }};
    const deleteList = (id) => updateLists(lists.filter(l => l.id !== id));
    const deleteGroup = (listId, groupId) => updateLists(lists.map(l => l.id === listId ? { ...l, groups: l.groups.filter(g => g.id !== groupId) } : l));

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white dark:bg-gray-900 rounded-3xl w-full max-w-lg h-[85vh] flex flex-col shadow-2xl overflow-hidden animate-fade-in">
                <div className="p-5 border-b dark:border-gray-700 flex justify-between items-center bg-gray-50 dark:bg-gray-800">
                    <h2 className="text-xl font-bold dark:text-white flex items-center"><Settings className="w-5 h-5 mr-2 text-blue-500"/> 配置中心</h2>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition"><X className="w-5 h-5 text-gray-500"/></button>
                </div>
                <div className="flex flex-1 overflow-hidden">
                    <div className="w-1/3 border-r dark:border-gray-700 bg-gray-50 dark:bg-black/20 p-3 overflow-y-auto">
                        <div className="space-y-1">{lists.map(list => (<div key={list.id} onClick={() => setActiveListId(list.id)} className={`p-3 rounded-xl cursor-pointer flex justify-between items-center text-sm transition-all ${activeListId === list.id ? 'bg-white dark:bg-gray-700 shadow-sm font-semibold text-blue-600 dark:text-blue-400' : 'hover:bg-gray-200 dark:hover:bg-gray-800 dark:text-gray-400'}`}><span className="truncate">{list.name}</span>{editMode && <button onClick={(e)=>{e.stopPropagation(); deleteList(list.id)}}><X className="w-3 h-3 text-red-500"/></button>}</div>))}</div>
                        <div className="mt-6"><input value={newList} onChange={e=>setNewList(e.target.value)} placeholder="+ 新建列表" className="w-full text-sm p-2 mb-2 rounded-lg border dark:bg-gray-800 dark:border-gray-700 dark:text-white outline-none focus:border-blue-500"/><button onClick={addList} className="w-full bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-300 text-xs py-2 rounded-lg hover:bg-blue-200 transition">添加</button><button onClick={()=>setEditMode(!editMode)} className="w-full mt-4 text-gray-400 text-xs hover:text-gray-600">{editMode?'完成编辑':'管理列表'}</button></div>
                    </div>
                    <div className="flex-1 p-5 bg-white dark:bg-gray-900 overflow-y-auto">
                        <div className="mb-6"><h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-3">{lists.find(l=>l.id===activeListId)?.name} 的分组</h3><div className="grid grid-cols-1 gap-3">{lists.find(l=>l.id===activeListId)?.groups?.map(group => (<div key={group.id} className="flex items-center p-3 rounded-xl border dark:border-gray-700 shadow-sm bg-white dark:bg-gray-800" style={{borderLeft: `5px solid ${group.color}`}}><span className="flex-1 font-medium dark:text-gray-200">{group.name}</span>{editMode && <button onClick={()=>deleteGroup(activeListId, group.id)}><X className="w-4 h-4 text-red-400"/></button>}</div>))}</div></div>
                        {activeListId && (<div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl border dark:border-gray-700"><h4 className="font-bold text-gray-700 dark:text-gray-300 mb-3">新建分组</h4><input value={newGroup.name} onChange={e=>setNewGroup({...newGroup, name: e.target.value})} placeholder="输入组名称" className="w-full p-3 rounded-xl border mb-4 text-sm dark:bg-gray-800 dark:border-gray-600 dark:text-white outline-none focus:ring-2 ring-blue-500"/><label className="block text-xs text-gray-500 mb-2">选择主题色</label><ColorPicker selectedColor={newGroup.color} onSelect={(color) => setNewGroup({...newGroup, color})}/><button onClick={()=>addGroup(activeListId)} disabled={!newGroup.name} className="w-full mt-6 bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-xl text-sm font-bold shadow-lg shadow-blue-500/20 disabled:opacity-50">创建新组</button></div>)}
                    </div>
                </div>
            </div>
        </div>
    );
};

const TaskItem = ({ task, updateTask, deleteTask, groupColor }) => {
    const [startX, setStartX] = useState(0);
    const [offsetX, setOffsetX] = useState(0);
    const [isEditing, setIsEditing] = useState(false);
    const [editTitle, setEditTitle] = useState(task.title);
    const [newSubtask, setNewSubtask] = useState('');
    const [showSubInput, setShowSubInput] = useState(false);
    
    const handleStart = (cx) => setStartX(cx);
    const handleMove = (cx) => { if (isEditing || startX === 0) return; const diff = cx - startX; if (diff < 0 && diff > -150) setOffsetX(diff); };
    const handleEnd = () => { if (offsetX < -60) setOffsetX(-120); else setOffsetX(0); setStartX(0); };
    
    const getContainerStyle = () => {
        const isDark = document.documentElement.classList.contains('dark');
        const baseBg = isDark ? '#111827' : '#ffffff'; 
        let style = { transform: `translateX(${offsetX}px)`, borderLeftColor: groupColor || '#cbd5e1', backgroundColor: baseBg };
        const subtasks = task.subtasks || [];
        const total = subtasks.length;
        const done = subtasks.filter(s => s.is_done).length;
        const progress = total > 0 ? (done / total) * 100 : 0;
        if (task.is_done) { style.backgroundColor = groupColor; style.color = 'white'; } else if (total > 0) { style.background = `linear-gradient(90deg, ${groupColor}33 ${progress}%, ${baseBg} ${progress}%)`; }
        return style;
    };

    return (
        <li className="relative mb-3 rounded-xl select-none group h-auto touch-pan-y">
            <div className="absolute inset-y-0 right-0 w-[120px] flex rounded-r-xl overflow-hidden z-0 bg-gray-100 dark:bg-gray-800">
                <button onClick={() => { setIsEditing(true); setOffsetX(0); }} className="flex-1 bg-blue-500 text-white flex items-center justify-center active:bg-blue-600"><Edit2 className="w-5 h-5" /></button>
                <button onClick={() => deleteTask(task.id)} className="flex-1 bg-red-500 text-white flex items-center justify-center active:bg-red-600"><Trash2 className="w-5 h-5" /></button>
            </div>
            <div className={`relative p-4 border-l-[6px] rounded-xl shadow-sm transition-transform duration-300 ease-out z-10 ${task.is_done ? '' : 'text-gray-800 dark:text-gray-100'}`} style={getContainerStyle()} onTouchStart={(e) => handleStart(e.touches[0].clientX)} onTouchMove={(e) => handleMove(e.touches[0].clientX)} onTouchEnd={handleEnd} onMouseDown={(e) => handleStart(e.clientX)} onMouseMove={(e) => handleMove(e.clientX)} onMouseUp={handleEnd} onMouseLeave={handleEnd}>
                <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start flex-1 overflow-hidden pointer-events-none"> 
                        <div onClick={(e) => { e.stopPropagation(); updateTask(task.id, { is_done: !task.is_done }); }} className={`w-6 h-6 rounded-full border-2 mr-3 mt-0.5 flex-shrink-0 flex items-center justify-center cursor-pointer pointer-events-auto transition-all duration-300 ${task.is_done ? 'bg-white/20 border-white scale-110' : 'border-gray-300 dark:border-gray-600 hover:border-blue-500'}`}>{task.is_done && <Check className="w-4 h-4 text-white" />}</div>
                        <div className="flex-1 min-w-0 pointer-events-auto">
                            {isEditing ? (
                                <div className="flex items-center gap-2">
                                    <input autoFocus value={editTitle} onChange={e=>setEditTitle(e.target.value)} className="flex-1 bg-white/90 text-black p-2 rounded-lg border outline-none text-sm" />
                                    <button onClick={() => { updateTask(task.id, { title: editTitle }); setIsEditing(false); }} className="text-green-600 bg-white rounded-lg p-2 shadow-sm"><Check className="w-4 h-4"/></button>
                                </div>
                            ) : (
                                <div>
                                    <span className={`text-lg font-medium leading-tight block ${task.is_done ? 'line-through opacity-80 text-white' : ''}`}>{task.title}</span>
                                    {!task.is_done && task.dueDate && (
                                        <div className="flex items-center mt-1.5 text-xs text-gray-500 dark:text-gray-400">
                                            <AlarmClock className="w-3 h-3 mr-1" />
                                            <span className={new Date(task.dueDate) < new Date() ? 'text-red-500 font-bold' : ''}>{formatSmartDate(task.dueDate)} 截止</span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="flex flex-col items-end gap-2 pointer-events-auto">
                        <DateBadge date={task.dueDate} onChange={(e) => updateTask(task.id, { dueDate: e.target.value })} isDone={task.is_done}/>
                        {(showSubInput || (task.subtasks?.length > 0)) && (<button onClick={(e) => { e.stopPropagation(); setShowSubInput(!showSubInput); }} className={`p-1.5 rounded-lg transition ${task.is_done ? 'text-white/80 hover:bg-white/20' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}><ChevronDown className="w-5 h-5" /></button>)}
                        {!showSubInput && !(task.subtasks?.length > 0) && (<button onClick={(e) => { e.stopPropagation(); setShowSubInput(true); }} className={`p-1.5 rounded-lg transition ${task.is_done ? 'text-white/80 hover:bg-white/20' : 'text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'}`}><Plus className="w-5 h-5" /></button>)}
                    </div>
                </div>
                {(showSubInput || (task.subtasks && task.subtasks.length > 0)) && (
                    <div className="mt-4 pl-2 space-y-3 pointer-events-auto border-t dark:border-white/10 pt-3">
                        {task.subtasks?.map((sub) => (
                            <div key={sub.id} className={`flex items-center justify-between text-sm group/sub p-2 rounded-lg transition ${task.is_done ? 'bg-white/10 text-white' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}>
                                <div onClick={() => { const newSubs = task.subtasks.map(s => s.id === sub.id ? { ...s, is_done: !s.is_done } : s); updateTask(task.id, { subtasks: newSubs }); }} className="flex items-center cursor-pointer flex-1">
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center mr-3 transition ${sub.is_done ? 'bg-current border-transparent opacity-60' : 'border-gray-400'}`}>{sub.is_done && <Check className="w-3 h-3 text-white mix-blend-difference" />}</div>
                                    <span className={sub.is_done ? 'line-through opacity-50' : ''}>{sub.title}</span>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover/sub:opacity-100 transition-opacity">
                                    <div className="relative p-1.5 hover:bg-gray-200 dark:hover:bg-gray-600 rounded"><Clock className="w-3.5 h-3.5 text-gray-400" /><input type="datetime-local" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => { const newSubs = task.subtasks.map(s => s.id === sub.id ? { ...s, dueDate: e.target.value } : s); updateTask(task.id, { subtasks: newSubs }); }}/></div>
                                    <button onClick={() => { const newSubs = task.subtasks.filter(s => s.id !== sub.id); updateTask(task.id, { subtasks: newSubs }); }} className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/30 rounded text-gray-400 hover:text-red-500"><X className="w-3.5 h-3.5" /></button>
                                </div>
                            </div>
                        ))}
                        {!task.is_done && (
                            <div className="flex items-center px-2">
                                <Plus className="w-4 h-4 text-gray-400 mr-2"/>
                                <input type="text" placeholder="添加子任务..." className={`flex-1 bg-transparent py-2 text-sm focus:outline-none ${task.is_done ? 'placeholder-white/50 text-white' : 'placeholder-gray-400 dark:text-gray-200'}`} value={newSubtask} onChange={e => setNewSubtask(e.target.value)} onKeyDown={e => { if(e.key === 'Enter' && newSubtask.trim()) { const newSub = { id: Date.now().toString(), title: newSubtask, is_done: false }; updateTask(task.id, { subtasks: [...(task.subtasks||[]), newSub] }); setNewSubtask(''); }}}/>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </li>
    );
};

// --- 主程序 ---
const App = () => {
    const [authKey, setAuthKey] = useState(localStorage.getItem('task_auth_key') || null);
    const [tasks, setTasks] = useState([]);
    const [error, setError] = useState('');
    
    // 列表状态，默认值用于没网或没数据的情况
    const defaultList = [{ id: 'default', name: '我的任务', groups: [{id: 'g1', name: '默认', color: '#6366f1'}] }];
    const [lists, setLists] = useState(defaultList);
    
    const [currentListId, setCurrentListId] = useState('default');
    const [themeMode, setThemeMode] = useState('auto');
    const [showCompleted, setShowCompleted] = useState(false);
    const [isListManagerOpen, setIsListManagerOpen] = useState(false);
    const [isTaskCreatorOpen, setIsTaskCreatorOpen] = useState(false);
    const [newTask, setNewTask] = useState({ title: '', groupId: '' });

    // 初始化数据 (并行拉取)
    const fetchData = useCallback(async () => {
        if (!authKey) return;
        try {
            // 同时获取任务和列表配置
            const [tasksData, listsData] = await Promise.all([
                api.fetchTasks(authKey),
                api.fetchLists(authKey)
            ]);
            
            setTasks(tasksData);
            
            // 如果云端有列表配置，更新本地；否则保持默认
            if (listsData && listsData.length > 0) {
                setLists(listsData);
                // 校验 currentListId 是否有效，无效则重置
                if (!listsData.find(l => l.id === currentListId)) {
                    setCurrentListId(listsData[0]?.id || 'default');
                }
            } else if (currentListId === 'default' && lists.length === 1 && lists[0].id === 'default') {
                // 如果是全新账号，自动保存一次默认列表到云端
                api.saveLists(authKey, defaultList);
            }

            setError('');
        } catch (e) {
            if (e.message === 'AUTH_FAILED') {
                setAuthKey(null);
                localStorage.removeItem('task_auth_key');
                setError('密钥无效');
            } else {
                console.error("Fetch error", e);
            }
        }
    }, [authKey, currentListId]);

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000); 
        return () => clearInterval(interval);
    }, [fetchData]);

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

    const handleLogin = (key) => { localStorage.setItem('task_auth_key', key); setAuthKey(key); };

    // 操作
    const handleAddTask = async (e) => {
        e.preventDefault();
        if (!newTask.title.trim()) return;
        
        const targetGroupId = newTask.groupId || lists.find(l=>l.id===currentListId)?.groups[0]?.id;
        const tempTask = { id: 'temp-' + Date.now(), title: newTask.title, is_done: false, groupId: targetGroupId, subtasks: [], dueDate: null, createdAt: new Date().toISOString() };
        
        setTasks(prev => [tempTask, ...prev]);
        setNewTask({ title: '', groupId: '' });
        setIsTaskCreatorOpen(false);
        
        try { 
            await api.addTask(authKey, tempTask); 
            fetchData(); 
        } catch (e) { 
            alert('添加失败'); 
            setTasks(prev => prev.filter(t => t.id !== tempTask.id)); 
        }
    };
    
    const updateTask = async (id, data) => { 
        setTasks(prev => prev.map(t => t.id === id ? { ...t, ...data } : t)); 
        await api.updateTask(authKey, id, data); 
    };
    
    const deleteTask = async (id) => { 
        setTasks(prev => prev.filter(t => t.id !== id)); 
        await api.deleteTask(authKey, id); 
    };

    if (!authKey) return <AuthForm onLogin={handleLogin} error={error} />;

    const currentList = lists.find(l => l.id === currentListId) || lists[0];
    const groupMap = currentList.groups?.reduce((acc, g) => ({...acc, [g.id]: g}), {}) || {};
    
    // 根据当前选中的 listId 过滤任务
    // 注意：之前的数据库结构中没有 listId 字段，如果是旧数据，可能需要根据业务逻辑处理
    // 这里暂时假设所有任务都显示，或者你需要修改数据库结构增加 listId 字段来做过滤
    // 为了兼容旧数据，我们暂时不过滤 listId，而是靠 groupId 来区分颜色，或者你可以选择:
    // const pendingTasks = tasks.filter(t => !t.is_done && (t.listId === currentListId || !t.listId)); 
    // 下面是简单版，不过滤 listId，只显示所有任务（适合个人使用）
    const pendingTasks = tasks.filter(t => !t.is_done);
    const completedTasks = tasks.filter(t => t.is_done);

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors duration-500 overflow-x-hidden font-sans">
            <header className="sticky top-0 z-40 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md border-b dark:border-gray-800 p-4 px-6 flex justify-between items-center shadow-sm">
                <div className="relative group">
                    <button className="flex items-center space-x-2 text-xl font-bold text-gray-800 dark:text-white hover:opacity-70 transition"><Layers className="w-6 h-6 text-blue-600"/><span>{currentList?.name}</span><ChevronDown className="w-4 h-4 text-gray-400"/></button>
                    <div className="absolute top-full left-0 mt-4 w-56 bg-white dark:bg-gray-800 rounded-2xl shadow-2xl border dark:border-gray-700 overflow-hidden hidden group-hover:block animate-fade-in p-2">
                        {lists.map(list => (<button key={list.id} onClick={()=>setCurrentListId(list.id)} className="w-full text-left px-4 py-3 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 text-sm dark:text-gray-200 font-medium transition">{list.name}</button>))}
                        <div className="border-t dark:border-gray-700 my-2"></div>
                        <button onClick={()=>setIsListManagerOpen(true)} className="w-full text-left px-4 py-2 rounded-xl text-blue-500 text-xs flex items-center hover:bg-blue-50 dark:hover:bg-blue-900/20 font-bold"><Settings className="w-3 h-3 mr-2"/> 配置列表</button>
                    </div>
                </div>
                <div className="flex items-center space-x-4">
                    <div className="flex bg-gray-100 dark:bg-gray-800 rounded-full p-1 relative shadow-inner"><button onClick={() => setThemeMode(themeMode === 'light' ? 'auto' : 'light')} className={`p-2 rounded-full transition-all z-10 ${themeMode === 'light' ? 'bg-white text-orange-500 shadow-sm' : 'text-gray-400'}`}><Sun className="w-4 h-4" /></button><button onClick={() => setThemeMode(themeMode === 'dark' ? 'auto' : 'dark')} className={`p-2 rounded-full transition-all z-10 ${themeMode === 'dark' ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-400'}`}><Moon className="w-4 h-4" /></button>{themeMode === 'auto' && <div className="absolute inset-0 border-2 border-blue-500/50 rounded-full pointer-events-none animate-pulse"></div>}</div>
                    <button onClick={() => {setAuthKey(null); localStorage.removeItem('task_auth_key');}} className="p-2 text-gray-400 hover:text-red-500 bg-gray-100 dark:bg-gray-800 rounded-full"><LogOut className="w-4 h-4"/></button>
                </div>
            </header>

            <main className="max-w-3xl mx-auto p-4 pb-32">
                <div className="space-y-4 min-h-[50vh]">
                    {pendingTasks.map(task => {
                        // 查找该任务所属的组颜色，跨列表查找
                        let color = '#cbd5e1';
                        // 遍历所有列表找这个 groupId
                        for(const l of lists) {
                            const found = l.groups?.find(g => g.id === task.groupId);
                            if(found) { color = found.color; break; }
                        }
                        return <TaskItem key={task.id} task={task} updateTask={updateTask} deleteTask={deleteTask} groupColor={color}/>;
                    })}
                    {pendingTasks.length === 0 && <div className="text-center py-20 text-gray-400 dark:text-gray-600"><p>任务清空，享受当下 ☕</p></div>}
                </div>
                {completedTasks.length > 0 && (
                    <div className="mt-10">
                        <button onClick={() => setShowCompleted(!showCompleted)} className="flex items-center text-sm font-bold text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition mb-4">{showCompleted ? <ChevronDown className="w-4 h-4 mr-2"/> : <ChevronRight className="w-4 h-4 mr-2"/>} 已完成 ({completedTasks.length})</button>
                        {showCompleted && <div className="space-y-4 opacity-80">{completedTasks.map(task => {
                             let color = '#cbd5e1';
                             for(const l of lists) {
                                 const found = l.groups?.find(g => g.id === task.groupId);
                                 if(found) { color = found.color; break; }
                             }
                            return <TaskItem key={task.id} task={task} updateTask={updateTask} deleteTask={deleteTask} groupColor={color}/>
                        })}</div>}
                    </div>
                )}
            </main>

            {isTaskCreatorOpen ? (
                <div className="fixed inset-x-0 bottom-0 bg-white dark:bg-gray-800 shadow-[0_-10px_40px_rgba(0,0,0,0.15)] rounded-t-3xl z-50 animate-slide-in p-6 border-t dark:border-gray-700">
                    <form onSubmit={handleAddTask}>
                        <div className="flex items-center space-x-2 mb-5 overflow-x-auto no-scrollbar pb-1">
                            {currentList.groups?.map(g => (<button type="button" key={g.id} onClick={() => setNewTask({...newTask, groupId: g.id})} className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition transform active:scale-95 border-2 ${newTask.groupId === g.id ? 'text-white scale-105 shadow-md' : 'bg-transparent border-gray-200 dark:border-gray-600 text-gray-500 dark:text-gray-400'}`} style={newTask.groupId === g.id ? {backgroundColor: g.color, borderColor: g.color} : {}}>{g.name}</button>))}
                            <button type="button" onClick={()=>setIsListManagerOpen(true)} className="p-2 rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200"><Plus className="w-4 h-4 text-gray-500"/></button>
                        </div>
                        <div className="flex gap-3"><input autoFocus value={newTask.title} onChange={e=>setNewTask({...newTask, title: e.target.value})} placeholder="准备做什么？" className="flex-1 bg-gray-100 dark:bg-gray-900/50 border-none rounded-2xl p-4 text-lg focus:ring-2 ring-blue-500 outline-none dark:text-white transition"/><button type="submit" className="bg-blue-600 text-white p-4 rounded-2xl shadow-xl shadow-blue-500/30 hover:scale-105 transition"><Check/></button><button type="button" onClick={()=>setIsTaskCreatorOpen(false)} className="bg-gray-100 dark:bg-gray-700 text-gray-500 p-4 rounded-2xl hover:bg-gray-200 transition"><X/></button></div>
                    </form>
                </div>
            ) : (<button onClick={() => setIsTaskCreatorOpen(true)} className="fixed bottom-8 right-8 p-5 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-full shadow-2xl hover:scale-110 active:scale-90 transition-all z-40"><Plus className="w-8 h-8" /></button>)}
            <ListManager isOpen={isListManagerOpen} onClose={() => setIsListManagerOpen(false)} lists={lists} currentListId={currentListId} setLists={setLists} authKey={authKey}/>
        </div>
    );
};

export default App;
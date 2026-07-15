(() => {
  'use strict';

  const L = window.TodoLogic;
  const isTauri = Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__?.core);
  const COLORS = ['#5f8f83', '#6f8fb8', '#a77bb3', '#d07d70', '#d19a54', '#7f9a62', '#858991'];
  const DEFAULT_CATEGORIES = [
    { id: 'inbox', name: '收集箱', color: '#5f8f83', locked: true },
    { id: 'work', name: '工作', color: '#6f8fb8' },
    { id: 'study', name: '学习', color: '#a77bb3' },
    { id: 'life', name: '生活', color: '#d19a54' }
  ];
  const DEFAULT_STATE = {
    version: 1,
    tasks: [],
    categories: DEFAULT_CATEGORIES,
    history: [],
    settings: { opacity: 82, windowMode: 'normal', autostart: false, closeToTray: true }
  };
  const ui = { view: 'tasks', filter: 'open', category: '', priority: '', query: '' };
  let state = structuredClone(DEFAULT_STATE);
  let nativeStore = null;
  let saveTimer = null;

  const $ = (selector, parent = document) => parent.querySelector(selector);
  const $$ = (selector, parent = document) => [...parent.querySelectorAll(selector)];

  const storage = {
    async init() {
      if (isTauri && window.__TAURI__?.store?.load) {
        nativeStore = await window.__TAURI__.store.load('todo-data.json', { autoSave: 150 });
      }
    },
    async load() {
      try {
        const value = nativeStore ? await nativeStore.get('state') : JSON.parse(localStorage.getItem('muyu-todo-state') || 'null');
        return value && typeof value === 'object' ? value : null;
      } catch (error) {
        console.error('Could not load state', error);
        toast('数据读取失败，已使用空白清单', 'error');
        return null;
      }
    },
    async save() {
      try {
        if (nativeStore) await nativeStore.set('state', state);
        else localStorage.setItem('muyu-todo-state', JSON.stringify(state));
      } catch (error) {
        console.error('Could not save state', error);
        toast('保存失败，请及时导出备份', 'error');
      }
    }
  };

  function normalizeState(value) {
    const source = value && typeof value === 'object' ? value : {};
    const categories = Array.isArray(source.categories) ? source.categories.filter((item) => item?.id && item?.name) : [];
    if (!categories.some((item) => item.id === 'inbox')) categories.unshift(DEFAULT_CATEGORIES[0]);
    return {
      version: 1,
      tasks: Array.isArray(source.tasks) ? source.tasks.map(normalizeTask) : [],
      categories: categories.length ? categories : structuredClone(DEFAULT_CATEGORIES),
      history: Array.isArray(source.history) ? source.history.slice(0, 500) : [],
      settings: { ...DEFAULT_STATE.settings, ...(source.settings || {}) }
    };
  }

  function normalizeTask(task) {
    return {
      id: task.id || L.uid('task'),
      title: String(task.title || '未命名任务').slice(0, 120),
      notes: String(task.notes || '').slice(0, 1000),
      categoryId: task.categoryId || 'inbox',
      priority: ['none', 'low', 'medium', 'high'].includes(task.priority) ? task.priority : 'none',
      dueAt: task.dueAt || '',
      reminderAt: task.reminderAt || '',
      repeat: ['none', 'daily', 'weekdays', 'weekly', 'monthly'].includes(task.repeat) ? task.repeat : 'none',
      repeatInterval: Math.max(1, Math.min(99, Number(task.repeatInterval) || 1)),
      completed: Boolean(task.completed),
      completedAt: task.completedAt || '',
      notified: Boolean(task.notified),
      order: Number(task.order) || 0,
      createdAt: task.createdAt || new Date().toISOString(),
      updatedAt: task.updatedAt || new Date().toISOString()
    };
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => storage.save(), 80);
  }

  function categoryById(id) {
    return state.categories.find((category) => category.id === id) || state.categories[0];
  }

  function historyEntry(task, action) {
    state.history.unshift({ id: L.uid('history'), action, at: new Date().toISOString(), task: structuredClone(task) });
    state.history = state.history.slice(0, 500);
  }

  function toast(message, type = '') {
    const region = $('#toastRegion');
    if (!region) return;
    const item = document.createElement('div');
    item.className = `toast ${type}`;
    item.textContent = message;
    region.append(item);
    setTimeout(() => item.remove(), 2800);
  }

  function setView(view) {
    ui.view = view;
    $$('.view').forEach((element) => element.classList.toggle('active', element.dataset.view === view));
    $$('[data-nav]').forEach((button) => button.classList.toggle('active', button.dataset.nav === view));
    if (view === 'history') renderHistory();
    if (view === 'settings') renderSettings();
  }

  function renderDate() {
    const now = new Date();
    $('#todayLabel').textContent = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(now);
  }

  function renderCategoryControls() {
    const options = state.categories.map((category) => `<option value="${L.escapeHtml(category.id)}">${L.escapeHtml(category.name)}</option>`).join('');
    const categoryFilter = $('#categoryFilter');
    const taskCategory = $('#taskCategory');
    categoryFilter.innerHTML = `<option value="">全部分类</option>${options}`;
    categoryFilter.value = ui.category;
    taskCategory.innerHTML = options;

    $('#categoryStrip').innerHTML = [
      `<button class="category-chip ${ui.category === '' ? 'active' : ''}" data-category="" style="--category-color:var(--accent)"><i></i>全部</button>`,
      ...state.categories.map((category) => `<button class="category-chip ${ui.category === category.id ? 'active' : ''}" data-category="${L.escapeHtml(category.id)}" style="--category-color:${category.color}"><i></i>${L.escapeHtml(category.name)}</button>`)
    ].join('');
  }

  function repeatText(task) {
    const unit = { daily: '天', weekly: '周', monthly: '月' }[task.repeat];
    if (task.repeat === 'none') return '';
    if (task.repeat === 'weekdays') return '工作日重复';
    return task.repeatInterval > 1 ? `每 ${task.repeatInterval} ${unit}` : ({ daily: '每天', weekly: '每周', monthly: '每月' })[task.repeat];
  }

  function dueText(task) {
    if (!task.dueAt) return '';
    const label = L.formatDateTime(task.dueAt);
    if (!task.completed && L.isOverdue(task.dueAt)) return `<span class="overdue">◷ 已逾期 · ${L.escapeHtml(label)}</span>`;
    if (L.isToday(task.dueAt)) return `<span>◷ 今天 · ${L.escapeHtml(label.split(' ')[1] || label)}</span>`;
    return `<span>◷ ${L.escapeHtml(label)}</span>`;
  }

  function renderTasks() {
    renderCategoryControls();
    const visible = L.filterTasks(state.tasks, ui.query, ui.filter, ui.category, ui.priority);
    const list = $('#taskList');
    list.innerHTML = visible.map((task) => {
      const category = categoryById(task.categoryId);
      const repeat = repeatText(task);
      const reminder = task.reminderAt ? `<span>♢ 提醒 ${L.escapeHtml(L.formatDateTime(task.reminderAt))}</span>` : '';
      return `<article class="task-card ${task.completed ? 'completed' : ''}" data-id="${L.escapeHtml(task.id)}" style="--category-color:${category.color}">
        <button class="task-check ${task.completed ? 'checked' : ''}" data-action="toggle" aria-label="${task.completed ? '标记为未完成' : '完成任务'}"></button>
        <div class="task-main" data-action="edit">
          <div class="task-title-row"><span class="task-title">${L.escapeHtml(task.title)}</span>${task.priority !== 'none' ? `<i class="priority-mark priority-${task.priority}" title="${task.priority} priority"></i>` : ''}</div>
          ${task.notes ? `<p class="task-notes">${L.escapeHtml(task.notes)}</p>` : ''}
          <div class="task-meta"><span><i class="category-dot" style="--category-color:${category.color}"></i>${L.escapeHtml(category.name)}</span>${dueText(task)}${reminder}${repeat ? `<span>↻ ${L.escapeHtml(repeat)}</span>` : ''}</div>
        </div>
        <button class="task-menu" data-action="edit" aria-label="编辑任务">•••</button>
      </article>`;
    }).join('');

    $('#emptyState').hidden = visible.length > 0;
    updateOverview();
  }

  function updateOverview() {
    const open = state.tasks.filter((task) => !task.completed).length;
    const today = state.tasks.filter((task) => L.isToday(task.dueAt));
    const todayDone = today.filter((task) => task.completed).length;
    const progress = today.length ? Math.round((todayDone / today.length) * 100) : 0;
    $('#remainingCount').textContent = open;
    $('#progressValue').textContent = `${progress}%`;
    $('#progressRing').style.setProperty('--progress', `${progress * 3.6}deg`);
  }

  function historyDayLabel(iso) {
    const date = new Date(iso);
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const key = (value) => `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`;
    if (key(date) === key(today)) return '今天';
    if (key(date) === key(yesterday)) return '昨天';
    return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' }).format(date);
  }

  function renderHistory() {
    const groups = new Map();
    state.history.forEach((entry) => {
      const label = historyDayLabel(entry.at);
      if (!groups.has(label)) groups.set(label, []);
      groups.get(label).push(entry);
    });
    const actionLabel = { completed: '已完成', deleted: '已删除', reopened: '重新打开' };
    $('#historyList').innerHTML = [...groups.entries()].map(([day, entries]) => `<section class="history-day"><h3>${day}</h3>${entries.map((entry) => {
      const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(entry.at));
      const deleted = entry.action === 'deleted';
      return `<div class="history-item ${deleted ? 'deleted' : ''}"><span class="history-icon">${deleted ? '−' : '✓'}</span><div class="history-copy"><strong>${L.escapeHtml(entry.task?.title || '未知任务')}</strong><small>${actionLabel[entry.action] || entry.action} · ${time}</small></div><button class="restore-button" data-restore="${L.escapeHtml(entry.id)}">恢复</button></div>`;
    }).join('')}</section>`).join('');
    $('#historyEmpty').hidden = state.history.length > 0;
    const weekAgo = Date.now() - 7 * 86400000;
    const completed = state.history.filter((item) => item.action === 'completed');
    const weekly = completed.filter((item) => new Date(item.at).getTime() >= weekAgo).length;
    const recurring = completed.filter((item) => item.task?.repeat && item.task.repeat !== 'none').length;
    $('#historySummary').innerHTML = `<div class="history-stat"><strong>${completed.length}</strong><span>累计完成</span></div><div class="history-stat"><strong>${weekly}</strong><span>近七天</span></div><div class="history-stat"><strong>${recurring}</strong><span>重复习惯</span></div>`;
  }

  function renderSettings() {
    $$('#modeGrid button').forEach((button) => button.classList.toggle('active', button.dataset.mode === state.settings.windowMode));
    const opacity = Number(state.settings.opacity) || 82;
    $('#opacityRange').value = opacity;
    $('#opacityOutput').textContent = `${opacity}%`;
    $('#opacityRange').style.setProperty('--range-progress', `${((opacity - 35) / 65) * 100}%`);
    $('#autostartToggle').checked = Boolean(state.settings.autostart);
    $('#closeToTrayToggle').checked = Boolean(state.settings.closeToTray);
    $('#categoryManager').innerHTML = state.categories.map((category) => `<div class="category-row"><i class="category-dot" style="--category-color:${category.color}"></i><span>${L.escapeHtml(category.name)}</span>${category.locked ? '<small>默认</small>' : `<button data-delete-category="${L.escapeHtml(category.id)}">删除</button>`}</div>`).join('');
  }

  function renderAll() {
    renderDate();
    applyOpacity(state.settings.opacity);
    renderTasks();
    renderHistory();
    renderSettings();
  }

  function openTaskDialog(id = '', seedTitle = '') {
    const task = id ? state.tasks.find((item) => item.id === id) : null;
    $('#taskDialogTitle').textContent = task ? '编辑任务' : '新建任务';
    $('#taskId').value = task?.id || '';
    $('#taskTitle').value = task?.title || seedTitle;
    $('#taskNotes').value = task?.notes || '';
    $('#taskCategory').value = task?.categoryId || ui.category || 'inbox';
    $('#taskPriority').value = task?.priority || 'none';
    $('#taskDue').value = task?.dueAt || '';
    $('#taskReminder').value = task?.reminderAt || '';
    $('#taskRepeat').value = task?.repeat || 'none';
    $('#taskRepeatInterval').value = task?.repeatInterval || 1;
    $('#deleteTaskButton').hidden = !task;
    updateRepeatFields();
    $('#taskDialog').showModal();
    setTimeout(() => $('#taskTitle').focus(), 30);
  }

  function updateRepeatFields() {
    const repeat = $('#taskRepeat').value;
    $('.repeat-grid').classList.toggle('hidden-interval', repeat === 'none' || repeat === 'weekdays');
    $('#repeatUnit').textContent = ({ daily: '天', weekly: '周', monthly: '月' })[repeat] || '';
  }

  async function saveTaskFromForm(event) {
    event.preventDefault();
    const title = $('#taskTitle').value.trim();
    if (!title) return $('#taskTitle').focus();
    const dueAt = $('#taskDue').value;
    const reminderAt = $('#taskReminder').value;
    if (dueAt && reminderAt && L.parseLocal(reminderAt) > L.parseLocal(dueAt)) {
      toast('提醒时间不能晚于截止时间', 'error');
      return;
    }
    const id = $('#taskId').value;
    const existing = state.tasks.find((task) => task.id === id);
    const values = {
      title,
      notes: $('#taskNotes').value.trim(),
      categoryId: $('#taskCategory').value,
      priority: $('#taskPriority').value,
      dueAt,
      reminderAt,
      repeat: $('#taskRepeat').value,
      repeatInterval: Number($('#taskRepeatInterval').value) || 1,
      notified: existing?.reminderAt === reminderAt ? Boolean(existing.notified) : false,
      updatedAt: new Date().toISOString()
    };
    if (existing) Object.assign(existing, values);
    else state.tasks.unshift(normalizeTask({ ...values, id: L.uid('task'), order: Date.now(), createdAt: new Date().toISOString() }));
    if (reminderAt) ensureNotificationPermission();
    scheduleSave();
    $('#taskDialog').close();
    $('#quickInput').value = '';
    renderTasks();
    toast(existing ? '任务已更新' : '任务已添加');
  }

  function quickAdd() {
    const input = $('#quickInput');
    const title = input.value.trim();
    if (!title) return;
    state.tasks.unshift(normalizeTask({ id: L.uid('task'), title, categoryId: ui.category || 'inbox', order: Date.now(), createdAt: new Date().toISOString() }));
    input.value = '';
    scheduleSave();
    renderTasks();
  }

  function toggleTask(id) {
    const task = state.tasks.find((item) => item.id === id);
    if (!task) return;
    if (!task.completed) {
      historyEntry(task, 'completed');
      if (task.repeat !== 'none') {
        const nextDue = L.nextOccurrence(task.dueAt || L.toLocalInput(new Date()), task.repeat, task.repeatInterval);
        task.reminderAt = L.shiftReminder(task.dueAt, task.reminderAt, nextDue);
        task.dueAt = nextDue;
        task.notified = false;
        task.updatedAt = new Date().toISOString();
        toast(`已完成，下一次：${L.formatDateTime(nextDue)}`);
      } else {
        task.completed = true;
        task.completedAt = new Date().toISOString();
      }
    } else {
      historyEntry(task, 'reopened');
      task.completed = false;
      task.completedAt = '';
    }
    scheduleSave();
    renderTasks();
    if (ui.view === 'history') renderHistory();
  }

  function deleteTask(id) {
    const index = state.tasks.findIndex((task) => task.id === id);
    if (index < 0) return;
    const [task] = state.tasks.splice(index, 1);
    historyEntry(task, 'deleted');
    scheduleSave();
    $('#taskDialog').close();
    renderTasks();
    renderHistory();
    toast('任务已移入历史');
  }

  function restoreHistory(id) {
    const entry = state.history.find((item) => item.id === id);
    if (!entry?.task) return;
    const existing = state.tasks.find((task) => task.id === entry.task.id);
    if (existing) {
      existing.completed = false;
      existing.completedAt = '';
      existing.notified = false;
    } else {
      state.tasks.unshift(normalizeTask({ ...entry.task, completed: false, completedAt: '', notified: false, updatedAt: new Date().toISOString() }));
    }
    state.history = state.history.filter((item) => item.id !== id);
    scheduleSave();
    renderAll();
    toast('任务已恢复');
  }

  function applyOpacity(value) {
    const opacity = Math.max(35, Math.min(100, Number(value) || 82));
    document.documentElement.style.setProperty('--panel-alpha', (opacity / 100).toFixed(2));
  }

  async function invoke(command, args = {}) {
    if (!isTauri || !window.__TAURI__?.core?.invoke) return null;
    return window.__TAURI__.core.invoke(command, args);
  }

  async function setWindowMode(mode, notify = true) {
    state.settings.windowMode = mode;
    scheduleSave();
    renderSettings();
    try {
      await invoke('set_window_mode', { mode });
      if (notify) toast(({ desktop: '已切换到桌面层', normal: '已切换到普通窗口', pinned: '已设为始终置顶' })[mode]);
    } catch (error) {
      console.error(error);
      toast('窗口模式切换失败', 'error');
    }
  }

  async function ensureNotificationPermission() {
    const api = window.__TAURI__?.notification;
    if (!isTauri || !api) return true;
    try {
      if (await api.isPermissionGranted()) return true;
      return (await api.requestPermission()) === 'granted';
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  async function sendReminder(task) {
    const granted = await ensureNotificationPermission();
    if (granted && window.__TAURI__?.notification) {
      window.__TAURI__.notification.sendNotification({ title: `待办提醒 · ${task.title}`, body: task.notes || (task.dueAt ? `截止：${L.formatDateTime(task.dueAt)}` : '该开始行动了') });
    } else if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(`待办提醒 · ${task.title}`, { body: task.notes || '该开始行动了' });
    }
  }

  async function checkReminders() {
    const now = Date.now();
    const due = state.tasks.filter((task) => !task.completed && !task.notified && task.reminderAt && L.parseLocal(task.reminderAt)?.getTime() <= now);
    for (const task of due) {
      task.notified = true;
      await sendReminder(task);
    }
    if (due.length) {
      scheduleSave();
      renderTasks();
    }
  }

  function openCategoryDialog() {
    $('#categoryName').value = '';
    $$('.color-option').forEach((option, index) => option.classList.toggle('selected', index === 0));
    $('#categoryDialog').showModal();
    setTimeout(() => $('#categoryName').focus(), 30);
  }

  function createCategory(event) {
    event.preventDefault();
    const name = $('#categoryName').value.trim();
    if (!name) return;
    const selected = $('.color-option.selected');
    state.categories.push({ id: L.uid('category'), name, color: selected?.dataset.color || COLORS[0] });
    scheduleSave();
    $('#categoryDialog').close();
    renderAll();
    toast('分类已创建');
  }

  function deleteCategory(id) {
    const category = state.categories.find((item) => item.id === id);
    if (!category || category.locked || !confirm(`删除“${category.name}”？其中任务将移入收集箱。`)) return;
    state.tasks.forEach((task) => { if (task.categoryId === id) task.categoryId = 'inbox'; });
    state.categories = state.categories.filter((item) => item.id !== id);
    if (ui.category === id) ui.category = '';
    scheduleSave();
    renderAll();
  }

  function exportBackup() {
    const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), app: 'muyu-todo', state }, null, 2)], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `muyu-todo-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    toast('备份已导出');
  }

  async function importBackup(file) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const incoming = parsed.state || parsed;
      if (!Array.isArray(incoming.tasks)) throw new Error('Invalid backup');
      if (!confirm(`将导入 ${incoming.tasks.length} 个任务并覆盖当前数据，是否继续？`)) return;
      state = normalizeState(incoming);
      await storage.save();
      renderAll();
      toast('备份导入成功');
    } catch (error) {
      console.error(error);
      toast('无法识别这个备份文件', 'error');
    } finally {
      $('#importInput').value = '';
    }
  }

  async function setAutostart(enabled) {
    try {
      const api = window.__TAURI__?.autostart;
      if (isTauri && api) enabled ? await api.enable() : await api.disable();
      state.settings.autostart = enabled;
      scheduleSave();
      toast(enabled ? '已开启开机启动' : '已关闭开机启动');
    } catch (error) {
      console.error(error);
      $('#autostartToggle').checked = !enabled;
      toast('开机启动设置失败', 'error');
    }
  }

  function bindEvents() {
    $$('[data-nav]').forEach((button) => button.addEventListener('click', () => setView(button.dataset.nav)));
    $('#focusButton').addEventListener('click', () => {
      ui.filter = 'today';
      setView('tasks');
      $('#filterPanel').hidden = false;
      $('#filterToggle').setAttribute('aria-expanded', 'true');
      $$('#statusFilters button').forEach((button) => button.classList.toggle('active', button.dataset.filter === 'today'));
      renderTasks();
    });
    $('#newTaskButton').addEventListener('click', () => openTaskDialog());
    $('#quickInput').addEventListener('keydown', (event) => { if (event.key === 'Enter') quickAdd(); });
    $('#quickDetailButton').addEventListener('click', () => openTaskDialog('', $('#quickInput').value.trim()));
    $('#searchInput').addEventListener('input', (event) => { ui.query = event.target.value; renderTasks(); });
    $('#filterToggle').addEventListener('click', () => {
      const panel = $('#filterPanel');
      panel.hidden = !panel.hidden;
      $('#filterToggle').setAttribute('aria-expanded', String(!panel.hidden));
    });
    $('#statusFilters').addEventListener('click', (event) => {
      const button = event.target.closest('[data-filter]');
      if (!button) return;
      ui.filter = button.dataset.filter;
      $$('#statusFilters button').forEach((item) => item.classList.toggle('active', item === button));
      renderTasks();
    });
    $('#categoryFilter').addEventListener('change', (event) => { ui.category = event.target.value; renderTasks(); });
    $('#priorityFilter').addEventListener('change', (event) => { ui.priority = event.target.value; renderTasks(); });
    $('#categoryStrip').addEventListener('click', (event) => {
      const button = event.target.closest('[data-category]');
      if (!button) return;
      ui.category = button.dataset.category;
      renderTasks();
    });
    $('#taskList').addEventListener('click', (event) => {
      const card = event.target.closest('[data-id]');
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (!card || !action) return;
      action === 'toggle' ? toggleTask(card.dataset.id) : openTaskDialog(card.dataset.id);
    });
    $('#taskForm').addEventListener('submit', saveTaskFromForm);
    $('#taskRepeat').addEventListener('change', updateRepeatFields);
    $('#deleteTaskButton').addEventListener('click', () => {
      const id = $('#taskId').value;
      const task = state.tasks.find((item) => item.id === id);
      if (task && confirm(`删除“${task.title}”？`)) deleteTask(id);
    });
    $('#historyList').addEventListener('click', (event) => {
      const button = event.target.closest('[data-restore]');
      if (button) restoreHistory(button.dataset.restore);
    });
    $('#clearHistoryButton').addEventListener('click', () => {
      if (!state.history.length || !confirm('确定清空全部历史记录？此操作无法撤销。')) return;
      state.history = [];
      scheduleSave();
      renderHistory();
    });
    $('#modeGrid').addEventListener('click', (event) => {
      const button = event.target.closest('[data-mode]');
      if (button) setWindowMode(button.dataset.mode);
    });
    $('#modeCycleButton').addEventListener('click', () => {
      const modes = ['desktop', 'normal', 'pinned'];
      setWindowMode(modes[(modes.indexOf(state.settings.windowMode) + 1) % modes.length]);
    });
    $('#opacityRange').addEventListener('input', (event) => {
      state.settings.opacity = Number(event.target.value);
      applyOpacity(state.settings.opacity);
      $('#opacityOutput').textContent = `${state.settings.opacity}%`;
      event.target.style.setProperty('--range-progress', `${((state.settings.opacity - 35) / 65) * 100}%`);
      scheduleSave();
    });
    $('#autostartToggle').addEventListener('change', (event) => setAutostart(event.target.checked));
    $('#closeToTrayToggle').addEventListener('change', (event) => { state.settings.closeToTray = event.target.checked; scheduleSave(); });
    $('#addCategoryButton').addEventListener('click', openCategoryDialog);
    $('#categoryForm').addEventListener('submit', createCategory);
    $('#categoryManager').addEventListener('click', (event) => {
      const button = event.target.closest('[data-delete-category]');
      if (button) deleteCategory(button.dataset.deleteCategory);
    });
    $('#categoryColors').addEventListener('click', (event) => {
      const button = event.target.closest('[data-color]');
      if (!button) return;
      $$('.color-option').forEach((item) => item.classList.toggle('selected', item === button));
    });
    $('#exportButton').addEventListener('click', exportBackup);
    $('#importButton').addEventListener('click', () => $('#importInput').click());
    $('#importInput').addEventListener('change', (event) => importBackup(event.target.files[0]));
    $('#minimizeButton').addEventListener('click', () => window.__TAURI__?.window?.getCurrentWindow().minimize());
    $('#closeButton').addEventListener('click', async () => {
      if (!isTauri) return;
      if (state.settings.closeToTray) await window.__TAURI__?.window?.getCurrentWindow().hide();
      else await invoke('quit_app');
    });
  }

  async function initializeNativeState() {
    if (!isTauri) return;
    try {
      const autostart = window.__TAURI__?.autostart;
      if (autostart) state.settings.autostart = await autostart.isEnabled();
      await setWindowMode(state.settings.windowMode, false);
    } catch (error) {
      console.error('Native initialization failed', error);
    }
  }

  async function init() {
    if (!isTauri) document.body.classList.add('browser-preview');
    $('#categoryColors').innerHTML = COLORS.map((color, index) => `<button type="button" class="color-option ${index === 0 ? 'selected' : ''}" data-color="${color}" style="--swatch:${color}" aria-label="选择颜色 ${color}"></button>`).join('');
    bindEvents();
    await storage.init();
    state = normalizeState(await storage.load());
    renderAll();
    await initializeNativeState();
    setInterval(checkReminders, 30000);
    checkReminders();
  }

  init();
})();

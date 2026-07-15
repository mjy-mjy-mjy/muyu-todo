(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.TodoLogic = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  const pad = (value) => String(value).padStart(2, '0');

  function uid(prefix = 'id') {
    if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function toLocalInput(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function parseLocal(value) {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function nextOccurrence(value, repeat = 'none', interval = 1) {
    const base = parseLocal(value) || new Date();
    const amount = Math.max(1, Number(interval) || 1);
    if (repeat === 'daily') base.setDate(base.getDate() + amount);
    else if (repeat === 'weekly') base.setDate(base.getDate() + 7 * amount);
    else if (repeat === 'monthly') base.setMonth(base.getMonth() + amount);
    else if (repeat === 'weekdays') {
      do base.setDate(base.getDate() + 1); while (base.getDay() === 0 || base.getDay() === 6);
    } else return '';
    return toLocalInput(base);
  }

  function shiftReminder(oldDue, oldReminder, nextDue) {
    const due = parseLocal(oldDue);
    const reminder = parseLocal(oldReminder);
    const next = parseLocal(nextDue);
    if (!due || !reminder || !next) return '';
    return toLocalInput(new Date(next.getTime() - (due.getTime() - reminder.getTime())));
  }

  function isToday(value, now = new Date()) {
    const date = parseLocal(value);
    return Boolean(date && date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate());
  }

  function isOverdue(value, now = new Date()) {
    const date = parseLocal(value);
    return Boolean(date && date.getTime() < now.getTime());
  }

  function startOfTomorrow(now = new Date()) {
    const date = new Date(now);
    date.setHours(24, 0, 0, 0);
    return date;
  }

  function matchesFilter(task, filter, now = new Date()) {
    if (filter === 'completed') return task.completed;
    if (task.completed) return filter === 'all';
    if (filter === 'today') return isToday(task.dueAt, now);
    if (filter === 'upcoming') {
      const due = parseLocal(task.dueAt);
      return Boolean(due && due >= startOfTomorrow(now));
    }
    return true;
  }

  function filterTasks(tasks, query, filter, category, priority, now = new Date()) {
    const needle = String(query || '').trim().toLocaleLowerCase();
    const weights = { high: 3, medium: 2, low: 1, none: 0 };
    return tasks.filter((task) => {
      const textMatches = !needle || `${task.title} ${task.notes || ''}`.toLocaleLowerCase().includes(needle);
      return textMatches && matchesFilter(task, filter, now) && (!category || task.categoryId === category) && (!priority || task.priority === priority);
    }).sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      const aDue = parseLocal(a.dueAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bDue = parseLocal(b.dueAt)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      if (aDue !== bDue) return aDue - bDue;
      if ((weights[a.priority] || 0) !== (weights[b.priority] || 0)) return (weights[b.priority] || 0) - (weights[a.priority] || 0);
      return (a.order || 0) - (b.order || 0) || String(b.createdAt).localeCompare(String(a.createdAt));
    });
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
  }

  function formatDateTime(value, locale = 'zh-CN') {
    const date = parseLocal(value);
    if (!date) return '';
    return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  }

  return { uid, toLocalInput, parseLocal, nextOccurrence, shiftReminder, isToday, isOverdue, filterTasks, escapeHtml, formatDateTime };
});

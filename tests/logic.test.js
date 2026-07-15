const test = require('node:test');
const assert = require('node:assert/strict');
const logic = require('../src/logic.js');

test('daily recurrence keeps the local time', () => {
  assert.equal(logic.nextOccurrence('2026-07-14T09:30', 'daily', 2), '2026-07-16T09:30');
});

test('weekday recurrence skips weekends', () => {
  assert.equal(logic.nextOccurrence('2026-07-17T18:00', 'weekdays'), '2026-07-20T18:00');
});

test('reminder offset follows the next due date', () => {
  assert.equal(logic.shiftReminder('2026-07-14T10:00', '2026-07-14T09:30', '2026-07-15T10:00'), '2026-07-15T09:30');
});

test('filtering is case insensitive and sorts due tasks first', () => {
  const tasks = [
    { title: 'Read BOOK', notes: '', completed: false, categoryId: 'a', priority: 'low', dueAt: '2026-08-02T09:00', createdAt: '1' },
    { title: 'book notes', notes: '', completed: false, categoryId: 'a', priority: 'high', dueAt: '2026-08-01T09:00', createdAt: '2' }
  ];
  assert.deepEqual(logic.filterTasks(tasks, 'Book', 'all', '', '').map((task) => task.title), ['book notes', 'Read BOOK']);
});

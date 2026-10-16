/**
 * Explicit cascading deletes. Turso connections don't reliably enforce
 * ON DELETE CASCADE, so child rows are removed by hand in one atomic batch.
 */
const { db } = require('./db');

const GROUP_CHILDREN = (where) => [
  [`DELETE FROM transactions WHERE group_expense_id IN (SELECT id FROM group_expenses WHERE group_id IN (${where}))`],
  [`DELETE FROM group_expense_shares WHERE expense_id IN (SELECT id FROM group_expenses WHERE group_id IN (${where}))`],
  [`DELETE FROM group_expenses WHERE group_id IN (${where})`],
  [`DELETE FROM settlements WHERE group_id IN (${where})`],
  [`DELETE FROM group_members WHERE group_id IN (${where})`],
];

function deleteGroup(groupId) {
  const stmts = GROUP_CHILDREN('?').map(([sql]) => [sql, groupId]);
  return db.batch([...stmts, ['DELETE FROM groups WHERE id = ?', groupId]]);
}

function deleteUser(userId) {
  const owned = 'SELECT id FROM groups WHERE created_by = ?';
  return db.batch([
    ...GROUP_CHILDREN(owned).map(([sql]) => [sql, userId]),
    ['DELETE FROM groups WHERE created_by = ?', userId],
    ['UPDATE group_members SET user_id = NULL WHERE user_id = ?', userId],
    ['UPDATE group_expenses SET created_by = NULL WHERE created_by = ?', userId],
    ['DELETE FROM transactions WHERE user_id = ?', userId],
    ['DELETE FROM categories WHERE user_id = ?', userId],
    ['DELETE FROM api_keys WHERE user_id = ?', userId],
    ['DELETE FROM push_subscriptions WHERE user_id = ?', userId],
    ['DELETE FROM users WHERE id = ?', userId],
  ]);
}

module.exports = { deleteGroup, deleteUser };

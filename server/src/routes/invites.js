/**
 * Invite links. Two kinds of token:
 *  - a member token: claims a placeholder spot ("Tara") and its expense history
 *  - a group token: joins the group as a new member
 */
const express = require('express');
const { db } = require('../db');
const { HttpError, requireAuth } = require('../util');
const { notify } = require('../push');

const router = express.Router();

async function findInvite(token) {
  if (!token || token.length < 10) return null;
  const member = await db.get('SELECT * FROM group_members WHERE invite_token = ?', token);
  if (member) return { kind: 'member', member, groupId: member.group_id };
  const group = await db.get('SELECT id FROM groups WHERE invite_token = ?', token);
  return group ? { kind: 'group', groupId: group.id } : null;
}

// Public preview, shown before the person logs in or signs up.
router.get('/:token', async (req, res) => {
  const inv = await findInvite(req.params.token);
  if (!inv) throw new HttpError(404, 'This invite link is invalid or has already been used');
  const group = await db.get(
    `SELECT g.name, g.emoji, u.name AS owner, (SELECT COUNT(*) FROM group_members WHERE group_id = g.id) AS members
     FROM groups g LEFT JOIN users u ON u.id = g.created_by WHERE g.id = ?`,
    inv.groupId
  );
  res.json({ kind: inv.kind, group, invited_as: inv.member?.name || null });
});

router.post('/:token/accept', requireAuth(), async (req, res) => {
  const inv = await findInvite(req.params.token);
  if (!inv) throw new HttpError(404, 'This invite link is invalid or has already been used');
  const already = await db.get('SELECT id FROM group_members WHERE group_id = ? AND user_id = ?', inv.groupId, req.user.id);
  if (already) return res.json({ group_id: inv.groupId, already: true });

  if (inv.kind === 'member') {
    // Take over the placeholder: keeps every expense and payment already recorded for it.
    const r = await db.run(
      'UPDATE group_members SET user_id = ?, name = ?, phone = ?, invite_token = NULL WHERE id = ? AND user_id IS NULL',
      req.user.id, req.user.name, req.user.phone, inv.member.id
    );
    if (!r.changes) throw new HttpError(409, 'Someone already used this invite');
  } else {
    await db.run(
      'INSERT INTO group_members (group_id, name, phone, user_id) VALUES (?, ?, ?, ?)',
      inv.groupId, req.user.name, req.user.phone, req.user.id
    );
  }
  // Let the people who are already in the group know.
  const group = await db.get('SELECT name, emoji FROM groups WHERE id = ?', inv.groupId);
  const others = await db.all('SELECT user_id FROM group_members WHERE group_id = ? AND user_id IS NOT NULL AND user_id != ?', inv.groupId, req.user.id);
  notify(others.map((o) => o.user_id), {
    title: `${group.emoji} ${group.name}`,
    body: `${req.user.name} joined the group`,
    url: `/splits/${inv.groupId}`,
    tag: `group-${inv.groupId}`,
  });
  res.json({ group_id: inv.groupId });
});

module.exports = router;

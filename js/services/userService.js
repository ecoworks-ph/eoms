import { COLLECTIONS, getAll, put, remove } from './localDb.js';
import { recordAudit, diffFields } from './auditLogService.js';

const userLabel = (p) => `User · ${(p && (p.fullName || p.email)) || 'Unknown'}`;
const USER_AUDIT_FIELDS = ['fullName', 'email', 'phone', 'role', 'status', 'department', 'deletedAt'];

export async function getProfiles() {
    return getAll(COLLECTIONS.PROFILES);
}

export async function createUser(profileData) {
    if (!profileData.department) profileData.department = 'Operations';
    if (!profileData.status) profileData.status = 'ACTIVE';
    const saved = await put(COLLECTIONS.PROFILES, profileData);
    await recordAudit({
        category: 'ADMIN_RBAC',
        eventType: 'CREATE_USER',
        resourceType: 'USER',
        resourceId: saved.id,
        resourceLabel: userLabel(saved),
        description: `User added: ${saved.fullName || saved.email || saved.id}`
    }, { always: true });
    return saved;
}

/** A removed (soft-deleted) user: suspended with a deletedAt stamp. */
export const isRemovedUser = (p) => !!(p && p.deletedAt);

/** Why `target` can't be removed by `actorId` (null when allowed). */
export function removeBlockReason(target, profiles, actorId) {
    if (!target) return 'User not found.';
    if (actorId !== null && actorId !== undefined && String(target.id) === String(actorId)) return "You can't remove your own account.";
    if (target.role === 'admin' && target.status !== 'SUSPENDED' && !isRemovedUser(target)) {
        const activeAdmins = profiles.filter(p => p.role === 'admin' && (!p.status || p.status === 'ACTIVE') && !isRemovedUser(p));
        if (activeAdmins.length <= 1) return "This is the last active admin. Add or activate another admin first.";
    }
    return null;
}

/** Soft delete: suspend + stamp deletedAt/deletedBy (no schema change). */
export async function removeUser(id, actorId) {
    const profiles = await getProfiles();
    const reason = removeBlockReason(profiles.find(p => p.id === id), profiles, actorId);
    if (reason) throw new Error(reason);
    return updateUser(id, { status: 'SUSPENDED', deletedAt: new Date().toISOString(), deletedBy: actorId ?? null }, {
        eventType: 'REMOVE_USER', verb: 'User removed'
    });
}

export async function restoreUser(id) {
    return updateUser(id, { status: 'ACTIVE', deletedAt: null, deletedBy: null }, {
        eventType: 'RESTORE_USER', verb: 'User restored'
    });
}

export async function updateUser(id, updates, { eventType = 'UPDATE_USER', verb = 'User updated' } = {}) {
    const profiles = await getProfiles();
    const profile = profiles.find(p => p.id === id);
    if (!profile) throw new Error('User not found');
    const before = { ...profile };
    Object.assign(profile, updates);
    const saved = await put(COLLECTIONS.PROFILES, profile);
    await recordAudit({
        category: 'ADMIN_RBAC',
        eventType,
        resourceType: 'USER',
        resourceId: profile.id,
        resourceLabel: userLabel(before),
        description: `${verb}: ${before.fullName || before.email || id}`,
        changesDelta: diffFields(before, profile, USER_AUDIT_FIELDS.filter(k => k in updates))
    }, eventType === 'UPDATE_USER' ? undefined : { always: true });
    return saved;
}

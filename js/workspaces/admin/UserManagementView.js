import { getProfiles, createUser, removeUser, restoreUser, isRemovedUser, removeBlockReason } from '../../services/userService.js';
import { getActiveProfileId } from '../../components/ActiveProfilePicker.js';
import { escapeHTML } from '../../shared/security.js';
import { formatStatus } from '../../shared/statusFormatter.js';
import { btnContent } from '../../shared/icons.js';

export default class UserManagementView {
    async render() {
        const container = document.createElement('div');
        container.className = 'card';
        
        container.innerHTML = `
            <h2>Users</h2>
            <div class="form-panel">
                <h3>Add New User</h3>
                <form id="add-user-form" class="form-row">
                    <div class="form-group">
                        <label>Full Name</label>
                        <input type="text" name="fullName" required>
                    </div>
                    <div class="form-group">
                        <label>Email</label>
                        <input type="email" name="email" required>
                    </div>
                    <div class="form-group">
                        <label>Phone Number</label>
                        <input type="tel" name="phone">
                    </div>
                    <div class="form-group">
                        <label>Role</label>
                        <select name="role" required>
                            <option value="operations">Operations</option>
                            <option value="customer_care_manager">Manager</option>
                            <option value="lead_engineer">Lead Engineer</option>
                            <option value="admin">Admin</option>
                        </select>
                    </div>
                    <button type="submit">${btnContent('plus', 'Add User')}</button>
                </form>
            </div>
            <div id="users-table-container">
                <div class="skeleton skeleton-table-row"></div>
                <div class="skeleton skeleton-table-row"></div>
                <div class="skeleton skeleton-table-row"></div>
                <div class="skeleton skeleton-table-row"></div>
                <div class="skeleton skeleton-table-row"></div>
            </div>
        `;

        const form = container.querySelector('#add-user-form');
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const formData = new FormData(form);
            try {
                await createUser({
                    fullName: formData.get('fullName'),
                    email: formData.get('email'),
                    phone: formData.get('phone'),
                    role: formData.get('role'),
                    department: 'Operations', // Default
                    status: 'ACTIVE'
                });
                form.reset();
                this.loadUsers(container.querySelector('#users-table-container'));
            } catch (err) {
                alert('Error creating user: ' + err.message);
            }
        });

        this.loadUsers(container.querySelector('#users-table-container'));

        return container;
    }

    async loadUsers(container) {
        try {
            const allProfiles = await getProfiles();
            const meId = getActiveProfileId();
            const profiles = allProfiles.filter(p => !isRemovedUser(p));
            const removed = allProfiles.filter(isRemovedUser)
                .sort((a, b) => String(b.deletedAt).localeCompare(String(a.deletedAt)));
            const showRemoved = !!this.showRemoved;
            const pill = (bg, fg, text) => `<span style="background: ${bg}; color: ${fg}; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.85rem;">${escapeHTML(text)}</span>`;
            const removedOn = (iso) => {
                const d = new Date(iso);
                return isNaN(d) ? '' : d.toLocaleDateString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric' });
            };
            const deleteBtn = (p) => {
                if (meId !== null && String(p.id) === String(meId)) {
                    return `<button type="button" class="user-delete-self btn-sm" disabled title="You can't delete your own account" aria-label="Delete (not available for your own account)" style="background-color: #fca5a5; color: white; cursor: not-allowed;">${btnContent('trash', 'Delete')}</button>`;
                }
                return `<button type="button" class="user-delete-btn btn-sm" data-id="${p.id}" title="Remove this user's access" aria-label="Delete ${escapeHTML(p.fullName || p.email || '')}" style="background-color: #dc2626; color: white;">${btnContent('trash', 'Delete')}</button>`;
            };
            container.innerHTML = `
                <label style="display: inline-flex; align-items: center; gap: 0.4rem; margin: 0.5rem 0; cursor: pointer;">
                    <input type="checkbox" id="show-removed-users" ${showRemoved ? 'checked' : ''}>
                    Show removed users (${removed.length})
                </label>
                <table style="width: 100%; text-align: left;">
                    <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>
                        ${profiles.map(p => `
                            <tr>
                                <td>${escapeHTML(p.fullName)}</td>
                                <td>${escapeHTML(p.email)}</td>
                                <td>${escapeHTML(p.role)}</td>
                                <td>${p.status === 'ACTIVE' ? pill('#d1fae5', '#065f46', formatStatus(p.status)) : pill('#fee2e2', '#991b1b', formatStatus(p.status))}</td>
                                <td>
                                    <button class="user-profile-btn btn-sm" data-id="${p.id}" title="Staff Profile" aria-label="Profile" style="background-color: #6366f1; color: white;">${btnContent('user', 'Profile')}</button>
                                    ${p.status === 'ACTIVE' ? deleteBtn(p) : ''}
                                </td>
                            </tr>
                        `).join('')}
                        ${showRemoved ? removed.map(p => `
                            <tr class="user-row--removed" style="opacity: 0.8;">
                                <td>${escapeHTML(p.fullName)}</td>
                                <td>${escapeHTML(p.email)}</td>
                                <td>${escapeHTML(p.role)}</td>
                                <td>${pill('#e5e7eb', '#374151', 'Removed')} <small style="color: #6b7684;">${escapeHTML(removedOn(p.deletedAt))}</small></td>
                                <td>
                                    <button type="button" class="user-restore-btn btn-sm" data-id="${p.id}" title="Restore access" aria-label="Restore ${escapeHTML(p.fullName || p.email || '')}" style="background-color: var(--brand-green); color: white;">${btnContent('refresh', 'Restore')}</button>
                                </td>
                            </tr>
                        `).join('') : ''}
                    </tbody>
                </table>
            `;

            container.querySelector('#show-removed-users').addEventListener('change', (e) => {
                this.showRemoved = e.target.checked;
                this.loadUsers(container);
            });

            container.querySelectorAll('.user-delete-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = parseInt(btn.dataset.id, 10);
                    const profile = allProfiles.find(p => p.id === id);
                    if (!profile) return;
                    const label = profile.fullName || profile.email || `User ${id}`;
                    const reason = removeBlockReason(profile, allProfiles, meId);
                    if (reason) {
                        this.openConfirm({ title: `Can't delete ${label}`, body: `<p class="user-confirm-blocked">${escapeHTML(reason)}</p>`, triggerBtn: btn });
                        return;
                    }
                    const name = String(profile.fullName || profile.email || '');
                    this.openConfirm({
                        title: `Delete ${label}?`,
                        body: `
                            <p>They won't be able to log in and will be hidden from lists. Past work keeps their name. You can restore them later.</p>
                            <div class="form-group">
                                <label for="confirm-delete-name">Type <strong>${escapeHTML(name)}</strong> to confirm</label>
                                <input type="text" id="confirm-delete-name" autocomplete="off" spellcheck="false">
                            </div>`,
                        confirmLabel: btnContent('trash', 'Delete'),
                        confirmStyle: 'background-color: #dc2626; color: white;',
                        needsText: name,
                        triggerBtn: btn,
                        onConfirm: async () => {
                            await removeUser(id, meId);
                            this.loadUsers(container);
                        }
                    });
                });
            });

            container.querySelectorAll('.user-restore-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    const id = parseInt(btn.dataset.id, 10);
                    const profile = allProfiles.find(p => p.id === id);
                    if (!profile) return;
                    this.openConfirm({
                        title: `Restore ${profile.fullName || profile.email || `User ${id}`}?`,
                        body: '<p>They will be able to log in again and will show up in lists and crew pickers.</p>',
                        confirmLabel: btnContent('refresh', 'Restore'),
                        confirmStyle: 'background-color: var(--brand-green); color: white;',
                        triggerBtn: btn,
                        onConfirm: async () => {
                            await restoreUser(id);
                            this.loadUsers(container);
                        }
                    });
                });
            });

            container.querySelectorAll('.user-profile-btn').forEach(btn => {
                btn.addEventListener('click', async () => {
                    const id = parseInt(btn.dataset.id, 10);
                    const profile = profiles.find(p => p.id === id);
                    if (!profile) return;

                    const modal = document.createElement('div');
                    modal.style.position = 'fixed';
                    modal.style.top = '0'; modal.style.left = '0'; modal.style.width = '100%'; modal.style.height = '100%';
                    modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
                    modal.style.display = 'flex'; modal.style.justifyContent = 'center'; modal.style.alignItems = 'center';
                    modal.style.zIndex = '1000';
                    
                    modal.innerHTML = `
                        <div style="background: white; padding: 2rem; border-radius: 8px; width: 400px; max-width: 90vw;">
                            <h3 style="margin-top: 0;">Staff Profile: ${escapeHTML(profile.fullName)}</h3>
                            <form id="staff-profile-form" class="form-stack">
                                <div class="form-group">
                                    <label>Email Address</label>
                                    <input type="email" name="email" value="${escapeHTML(profile.email)}" required>
                                </div>
                                <div class="form-group">
                                    <label>Phone Number</label>
                                    <input type="text" name="phone" value="${escapeHTML(profile.phone || '')}" placeholder="+63 912 345 6789">
                                </div>
                                <div class="form-row">
                                    <div class="form-group">
                                        <label>Role</label>
                                        <select name="role">
                                            <option value="operations" ${profile.role === 'operations' ? 'selected' : ''}>Operations</option>
                                            <option value="customer_care_manager" ${profile.role === 'customer_care_manager' ? 'selected' : ''}>Manager</option>
                                            <option value="lead_engineer" ${profile.role === 'lead_engineer' ? 'selected' : ''}>Lead Engineer</option>
                                            <option value="admin" ${profile.role === 'admin' ? 'selected' : ''}>Admin</option>
                                        </select>
                                    </div>
                                    <div class="form-group">
                                        <label>Status</label>
                                        <select name="status">
                                            <option value="ACTIVE" ${profile.status === 'ACTIVE' ? 'selected' : ''}>Active</option>
                                            <option value="SUSPENDED" ${profile.status === 'SUSPENDED' ? 'selected' : ''}>Suspended</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="form-group">
                                    <label>Department</label>
                                    <input type="text" name="department" value="${escapeHTML(profile.department || '')}">
                                </div>
                                <div class="modal-actions">
                                    <button type="button" id="staff-close-btn" style="background: #e2e8f0; color: #333;">${btnContent('x', 'Close')}</button>
                                    <button type="submit" style="background: var(--brand-green); color: white;">${btnContent('save', 'Save Changes')}</button>
                                </div>
                            </form>
                        </div>
                    `;
                    document.body.appendChild(modal);
                    
                    modal.querySelector('#staff-close-btn').addEventListener('click', () => {
                        document.body.removeChild(modal);
                    });

                    modal.querySelector('#staff-profile-form').addEventListener('submit', async (e2) => {
                        e2.preventDefault();
                        const formData = new FormData(e2.target);
                        const updates = {
                            email: formData.get('email'),
                            phone: formData.get('phone'),
                            role: formData.get('role'),
                            status: formData.get('status'),
                            department: formData.get('department')
                        };
                        
                        try {
                            const { updateUser } = await import('../../services/userService.js');
                            await updateUser(id, updates);
                            document.body.removeChild(modal);
                            this.loadUsers(container);
                        } catch(err) {
                            alert('Error updating staff profile: ' + err.message);
                        }
                    });
                });
            });

        } catch (e) {
            container.innerHTML = `<p style="color:red;">Failed to load users: ${escapeHTML(e.message)}</p>`;
        }
    }

    /**
     * Confirm dialog (same overlay pattern as the other popups). With `needsText`, the confirm button
     * stays disabled until the typed text matches exactly. Without onConfirm it is a plain info box.
     */
    openConfirm({ title, body, confirmLabel = '', confirmStyle = '', needsText = null, onConfirm = null, triggerBtn = null }) {
        const modal = document.createElement('div');
        modal.style.position = 'fixed';
        modal.style.top = '0'; modal.style.left = '0'; modal.style.width = '100%'; modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
        modal.style.display = 'flex'; modal.style.justifyContent = 'center'; modal.style.alignItems = 'center';
        modal.style.zIndex = '1000';
        modal.innerHTML = `
            <div role="dialog" aria-modal="true" aria-labelledby="user-confirm-title" tabindex="-1" class="user-confirm-dialog"
                 style="background: white; padding: 1.5rem; border-radius: 8px; width: 440px; max-width: 90vw;">
                <h3 id="user-confirm-title" style="margin-top: 0;">${escapeHTML(title)}</h3>
                ${body}
                <p class="user-confirm-error" role="alert" style="color: #b91c1c; display: none;"></p>
                <div class="modal-actions">
                    <button type="button" class="user-confirm-cancel" style="background: #e2e8f0; color: #333;">${btnContent('x', onConfirm ? 'Cancel' : 'Close')}</button>
                    ${onConfirm ? `<button type="button" class="user-confirm-ok" style="${confirmStyle}" ${needsText !== null ? 'disabled' : ''}>${confirmLabel}</button>` : ''}
                </div>
            </div>
        `;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const onKeydown = (e) => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
        const close = () => {
            document.body.style.overflow = prevOverflow;
            document.removeEventListener('keydown', onKeydown);
            if (modal.parentNode) modal.parentNode.removeChild(modal);
            if (triggerBtn && document.contains(triggerBtn)) triggerBtn.focus();
        };
        document.addEventListener('keydown', onKeydown);
        modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
        modal.querySelector('.user-confirm-cancel').addEventListener('click', close);

        const okBtn = modal.querySelector('.user-confirm-ok');
        const input = modal.querySelector('#confirm-delete-name');
        const matches = () => needsText === null || (!!input && input.value === needsText);
        if (input && okBtn) {
            input.addEventListener('input', () => { okBtn.disabled = !matches(); });
            input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && matches()) { e.preventDefault(); okBtn.click(); } });
        }
        if (okBtn) {
            okBtn.addEventListener('click', async () => {
                if (!matches()) return;
                okBtn.disabled = true;
                const err = modal.querySelector('.user-confirm-error');
                try {
                    await onConfirm();
                    close();
                } catch (e) {
                    err.textContent = (e && e.message) || 'Something went wrong. Please try again.';
                    err.style.display = '';
                    okBtn.disabled = !matches();
                }
            });
        }
        document.body.appendChild(modal);
        (input || modal.querySelector('.user-confirm-cancel')).focus();
    }
}

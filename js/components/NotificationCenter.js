import { getAll, put, COLLECTIONS, dbEvents } from '../services/localDb.js';
import { getActiveProfileId, getActiveProfile, profileEvents, isPathAllowed } from './ActiveProfilePicker.js';
import { escapeHTML } from '../shared/security.js';
import { supabase } from '../services/supabaseClient.js';
import { icon } from '../shared/icons.js';

// Module-level state so repeated calls never stack listeners/channels
let notifChannel = null;
let notifChannelProfileId = null;
let docClickBound = false;
let wiredContainerId = null;
let currentRender = null;

// Stored notification links point at /manager/*. Engineering can't open those,
// so map them to the matching /engineering page (or null = don't navigate).
const ENGINEERING_LINK_MAP = {
    '/manager/pendingvisits': '/engineering/inspections',
    '/manager/installations': '/engineering/installations',
    '/manager/calendar': '/engineering/calendar',
    '/manager/tickets': '/engineering/tickets'
};

function resolveNotifLink(link) {
    if (!link) return null;
    const role = getActiveProfile()?.role;
    if (role !== 'lead_engineer') return link;
    if (ENGINEERING_LINK_MAP[link]) return ENGINEERING_LINK_MAP[link];
    // Any other /manager link would just bounce to the engineering home; don't navigate.
    return isPathAllowed(role, link) ? link : null;
}

function subscribeNotifications(profileId, onChange) {
    if (notifChannelProfileId === profileId && notifChannel) return;
    if (notifChannel) {
        try { supabase.removeChannel(notifChannel); } catch (e) { console.error(e); }
        notifChannel = null;
        notifChannelProfileId = null;
    }
    if (!profileId) return;
    try {
        notifChannel = supabase
            .channel(`notifications-user-${profileId}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${profileId}` }, () => onChange())
            .subscribe();
        notifChannelProfileId = profileId;
    } catch (e) {
        console.error('Failed to subscribe to notifications realtime:', e);
    }
}

export async function renderNotificationCenter(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const render = async () => {
        const userId = getActiveProfileId();
        subscribeNotifications(userId, () => { if (currentRender) currentRender(); });
        if (!userId) {
            container.innerHTML = '';
            return;
        }

        const notifications = await getAll(COLLECTIONS.NOTIFICATIONS, n => n.userId === userId);
        const unreadCount = notifications.filter(n => !n.isRead).length;

        // Sort latest first
        notifications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

        container.innerHTML = `
            <div id="bell-icon" title="Notifications" aria-label="Notifications" style="font-size: 1.5rem; position: relative; color: var(--brand-blue); display: inline-flex; align-items: center; cursor: pointer;">
                ${icon('bell')}
                ${unreadCount > 0 ? `<span style="position: absolute; top: -5px; right: -5px; background: red; color: white; border-radius: 50%; font-size: 0.75rem; padding: 2px 6px;">${unreadCount}</span>` : ''}
            </div>
            <div id="notif-dropdown" style="display: none; position: absolute; top: 100%; right: 0; background: white; border: 1px solid #ccc; border-radius: 4px; width: 300px; max-height: 400px; overflow-y: auto; z-index: 2000; box-shadow: 0 4px 6px rgba(0,0,0,0.1); color: #333;">
                <h4 style="margin: 0; padding: 1rem; border-bottom: 1px solid #eee; background: #f8fafc;">Notifications</h4>
                ${notifications.length === 0 ? '<p style="padding: 1rem; margin: 0; text-align: center; color: #666;">No notifications</p>' : ''}
                <ul style="list-style: none; margin: 0; padding: 0;">
                    ${notifications.map(n => `
                        <li data-id="${n.id}" class="notif-item" style="padding: 1rem; border-bottom: 1px solid #eee; cursor: pointer; background: ${n.isRead ? 'white' : 'var(--brand-blue-soft)'};">
                            <p style="margin: 0; font-size: 0.9rem;">${escapeHTML(n.message)}</p>
                            <small style="color: #64748b;">${new Date(n.createdAt).toLocaleString()}</small>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `;

        const bell = container.querySelector('#bell-icon');
        const dropdown = container.querySelector('#notif-dropdown');

        bell.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
        });

        if (!docClickBound) {
            docClickBound = true;
            document.addEventListener('click', () => {
                const dd = document.getElementById('notif-dropdown');
                if (dd) dd.style.display = 'none';
            });
        }

        dropdown.addEventListener('click', (e) => {
            e.stopPropagation();
        });

        container.querySelectorAll('.notif-item').forEach(li => {
            li.addEventListener('click', async (e) => {
                const id = parseInt(e.currentTarget.dataset.id, 10);
                const notif = notifications.find(n => n.id === id);
                if (notif && !notif.isRead) {
                    notif.isRead = true;
                    await put(COLLECTIONS.NOTIFICATIONS, notif);
                    render(); // Re-render to update unread count and styles
                }
                
                // If there's a link, navigate
                const target = notif ? resolveNotifLink(notif.link) : null;
                if (target) {
                    window.history.pushState(null, '', target);
                    window.dispatchEvent(new PopStateEvent('popstate'));
                    dropdown.style.display = 'none';
                }
            });
        });
    };

    currentRender = render;

    // Initial render
    try { await render(); } catch (e) { console.error('Notification render failed:', e); }

    // Re-render on profile change or db update (bind once per container)
    if (wiredContainerId !== containerId) {
        wiredContainerId = containerId;
        const safeRender = () => { if (currentRender) currentRender().catch(e => console.error('Notification render failed:', e)); };
        profileEvents.addEventListener('profileChanged', safeRender);
        dbEvents.addEventListener('notifications_changed', safeRender);
    }
}

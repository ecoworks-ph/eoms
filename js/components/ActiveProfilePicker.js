// Signed-in user state + header user badge.
// (File name kept for import compatibility: getActiveProfileId / profileEvents
// are imported across the app.)
import { supabase } from '../services/supabaseClient.js';
import { escapeHTML } from '../shared/security.js';
import { btnContent, setBtnLabel } from '../shared/icons.js';

export const profileEvents = new EventTarget();

const ROLE_LABELS = {
    admin: 'Admin/Owner',
    customer_care_manager: 'Customer Care',
    lead_engineer: 'Engineering',
    operations: 'Operations'
};

// Workspace prefixes each role may open. Admin sees everything.
const ROLE_PREFIXES = {
    admin: ['/admin', '/manager', '/engineering', '/ocular'],
    customer_care_manager: ['/manager'],
    lead_engineer: ['/engineering'],
    operations: ['/ocular']
};

let activeProfile = null;

export function roleLabel(role) {
    return ROLE_LABELS[role] || role || '';
}

export function roleHome(role) {
    if (role === 'admin') return '/admin';
    if (role === 'operations') return '/ocular/home';
    if (role === 'customer_care_manager') return '/manager/pipeline';
    if (role === 'lead_engineer') return '/engineering/inventory';
    return null;
}

export function allowedPrefixes(role) {
    return ROLE_PREFIXES[role] || [];
}

export function isPathAllowed(role, path) {
    return allowedPrefixes(role).some(p => path === p || path.startsWith(p + '/'));
}

/** The signed-in user's profile ({ id, email, fullName, role, status }) or null. */
export function getActiveProfile() {
    return activeProfile;
}

export function setActiveProfile(row) {
    activeProfile = {
        id: Number(row.id),
        email: row.email,
        fullName: row.full_name ?? row.fullName ?? row.email,
        role: row.role,
        status: row.status
    };
    sessionStorage.setItem('activeProfileId', String(activeProfile.id));
    return activeProfile;
}

export function clearActiveProfile() {
    activeProfile = null;
    sessionStorage.removeItem('activeProfileId');
}

/**
 * True while the Sign out button is waiting for supabase.auth.signOut(). The
 * SIGNED_OUT listener in main.js skips its own redirect while this is set so
 * the POST /auth/v1/logout isn't aborted by a page navigation.
 */
let signOutInProgress = false;
export function isSignOutInProgress() {
    return signOutInProgress;
}

const withTimeout = (promise, ms) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))
]);

/**
 * Signs out. If the server call fails or takes longer than 3s (e.g. no
 * network) the local session would survive, so drop the stored supabase
 * token manually as a fallback.
 */
export async function signOutEverywhereLocal() {
    signOutInProgress = true;
    let failed = false;
    try {
        const { error } = await withTimeout(supabase.auth.signOut(), 3000);
        if (error) failed = true;
    } catch (err) {
        failed = true;
    }
    if (failed) {
        try {
            await withTimeout(supabase.auth.signOut({ scope: 'local' }), 1000);
        } catch (_) { /* ignore */ }
        try {
            Object.keys(localStorage)
                .filter(k => /^sb-.*-auth-token/.test(k))
                .forEach(k => localStorage.removeItem(k));
        } catch (_) { /* ignore */ }
    }
    clearActiveProfile();
    // SIGNED_OUT has already been emitted (or skipped) by now; callers redirect.
    signOutInProgress = false;
}

/** Renders "<name> · <role>" and a Sign out button into the header. */
export function renderProfilePicker(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    const p = activeProfile;
    if (!p) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <div class="user-badge">
            <div class="user-badge-text">
                <span class="user-badge-name">${escapeHTML(p.fullName || '')}</span>
                <span class="user-badge-role">${escapeHTML(roleLabel(p.role))}</span>
            </div>
            <button type="button" class="signout-btn">${btnContent('log-out', 'Sign out')}</button>
        </div>
    `;

    const btn = container.querySelector('.signout-btn');
    btn.addEventListener('click', async () => {
        btn.disabled = true;
        setBtnLabel(btn, 'Signing out...');
        // Wait for the server logout (max ~3s) before leaving the page; the
        // SIGNED_OUT listener in main.js defers to this redirect.
        await signOutEverywhereLocal();
        clearActiveProfile();
        location.replace('/');
    });
}

export function getActiveProfileId() {
    let id = sessionStorage.getItem('activeProfileId');
    return id ? parseInt(id, 10) : null;
}

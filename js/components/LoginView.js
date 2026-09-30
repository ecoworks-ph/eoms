import { supabase } from '../services/supabaseClient.js';
import { escapeHTML } from '../shared/security.js';
import { signOutEverywhereLocal } from './ActiveProfilePicker.js';
import { btnContent, setBtnLabel } from '../shared/icons.js';

const MSG_NETWORK = 'No network connection. Check your internet and try again.';

function isNetworkError(err) {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    if (!err) return false;
    const name = err.name || '';
    const msg = (err.message || '').toLowerCase();
    return name === 'AuthRetryableFetchError'
        || name === 'TypeError'
        || err.status === 0
        || msg.includes('failed to fetch')
        || msg.includes('network')
        || msg.includes('load failed');
}

function friendlyAuthError(err) {
    if (isNetworkError(err)) return MSG_NETWORK;
    const code = err?.code || '';
    const msg = (err?.message || '').toLowerCase();
    if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
        return 'Wrong email or password.';
    }
    if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
        return "Your email isn't confirmed yet. Contact the admin.";
    }
    if (err?.status === 429 || code === 'over_request_rate_limit') {
        return 'Too many attempts. Wait a minute and try again.';
    }
    return 'Sign in failed. Please try again.';
}

/**
 * Loads the app profile linked to a Supabase auth user.
 * Returns { profile } on success, or { error } with a user-facing message.
 * Signs the user out when the account is missing or suspended.
 */
export async function loadProfileForUser(user) {
    let data, error;
    try {
        ({ data, error } = await supabase
            .from('profiles')
            .select('id,email,full_name,role,status,data')
            .eq('auth_user_id', user.id)
            .maybeSingle());
    } catch (err) {
        error = err;
    }

    if (error) {
        console.error('Failed to load profile:', error);
        return {
            error: isNetworkError(error)
                ? MSG_NETWORK
                : "Couldn't load your account. Please try again."
        };
    }
    if (!data) {
        await signOutEverywhereLocal();
        return { error: "Your account isn't set up yet. Contact the admin." };
    }
    if (data.status === 'SUSPENDED') {
        await signOutEverywhereLocal();
        return { error: data.data && data.data.deletedAt
            ? 'Your account has been removed. Contact the admin.'
            : 'Your account is suspended.' };
    }
    return { profile: data };
}

/**
 * Renders the full-screen login into `container`.
 * onSignedIn(profileRow) is called after a successful sign-in + profile check.
 */
export function renderLoginView(container, { message = '', onSignedIn } = {}) {
    container.innerHTML = `
        <div class="login-screen">
            <form class="login-card" novalidate>
                <div class="login-brand">
                    <img src="/ecoworks-logo.png" alt="" class="login-logo">
                    <span>EOMS</span>
                </div>
                <h1 class="login-title">Sign in</h1>
                <label class="login-label" for="login-email">Email</label>
                <input id="login-email" class="login-input" type="email" name="email"
                    autocomplete="username" inputmode="email" autocapitalize="none"
                    spellcheck="false" required>
                <label class="login-label" for="login-password">Password</label>
                <input id="login-password" class="login-input" type="password" name="password"
                    autocomplete="current-password" required>
                <div class="login-error" role="alert" aria-live="assertive"${message ? '' : ' hidden'}>${escapeHTML(message)}</div>
                <button type="submit" class="login-submit">${btnContent('log-in', 'Sign in')}</button>
            </form>
        </div>
    `;

    const form = container.querySelector('form');
    const emailEl = form.querySelector('#login-email');
    const passEl = form.querySelector('#login-password');
    const errorEl = form.querySelector('.login-error');
    const submitBtn = form.querySelector('.login-submit');

    const showError = (text) => {
        errorEl.textContent = text;
        errorEl.hidden = !text;
    };
    const setLoading = (loading) => {
        submitBtn.disabled = loading;
        emailEl.disabled = loading;
        passEl.disabled = loading;
        setBtnLabel(submitBtn, loading ? 'Signing in...' : 'Sign in');
        form.classList.toggle('is-loading', loading);
    };

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = emailEl.value.trim();
        const password = passEl.value;
        if (!email || !password) {
            showError('Enter your email and password.');
            return;
        }
        showError('');
        setLoading(true);

        try {
            const { data, error } = await supabase.auth.signInWithPassword({ email, password });
            if (error || !data?.user) {
                showError(friendlyAuthError(error));
                setLoading(false);
                passEl.value = '';
                passEl.focus();
                return;
            }

            const result = await loadProfileForUser(data.user);
            if (result.error) {
                showError(result.error);
                setLoading(false);
                return;
            }

            if (onSignedIn) await onSignedIn(result.profile);
        } catch (err) {
            console.error('Sign in error:', err);
            showError(friendlyAuthError(err));
            setLoading(false);
        }
    });

    (emailEl.value ? passEl : emailEl).focus();
}

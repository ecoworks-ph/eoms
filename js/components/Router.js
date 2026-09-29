import { renderWorkspaceSwitcher } from './WorkspaceSwitcher.js';
import { getActiveProfile, roleHome, isPathAllowed } from './ActiveProfilePicker.js';

const routes = [
    { prefix: '/admin', importFn: () => import('../workspaces/AdminWorkspace.js') },
    { prefix: '/manager', importFn: () => import('../workspaces/ManagerWorkspace.js') },
    { prefix: '/engineering', importFn: () => import('../workspaces/EngineeringWorkspace.js') },
    { prefix: '/ocular', importFn: () => import('../workspaces/OperationsWorkspace.js') }
];

export async function navigateTo(url) {
    history.pushState(null, null, url);
    await router();
}

export async function router() {
    // Nothing renders until a signed-in profile is set (main.js shows login).
    const profile = getActiveProfile();
    if (!profile) return;

    let path = location.pathname;
    const home = roleHome(profile.role);
    if (!home) {
        document.getElementById('app-content').innerHTML =
            '<div class="card" style="margin: 2rem;"><h2>No workspace</h2><p>Your role has no workspace assigned. Contact the admin.</p></div>';
        document.getElementById('workspace-switcher-container').innerHTML = '';
        return;
    }

    // Default route + role guard: blocked or unknown workspaces go to the role home.
    if (path === '/' || path === '' || !isPathAllowed(profile.role, path)) {
        path = home;
        history.replaceState(null, null, path);
    }

    // Update workspace switcher
    await renderWorkspaceSwitcher('workspace-switcher-container', path);
    
    const match = routes.find(r => path.startsWith(r.prefix));
    const container = document.getElementById('app-content');
    
    if (match) {
        try {
            const module = await match.importFn();
            // Assuming each workspace exports a default class with a render(path) method
            const WorkspaceClass = module.default;
            const view = new WorkspaceClass();
            container.innerHTML = '';
            
            const element = await view.render(path);
            if (element) {
                container.appendChild(element);
            }
        } catch (e) {
            console.error(e);
            container.innerHTML = `<div class="card" style="margin: 2rem;"><h2>Error loading workspace</h2><pre>${e.message}</pre></div>`;
        }
    } else {
        container.innerHTML = `<div class="card" style="margin: 2rem;"><h2>404 - Not Found</h2><p>The path ${path} does not exist.</p></div>`;
    }
}

// Global click listener for router links
document.body.addEventListener('click', e => {
    // Find closest anchor tag with data-link
    const link = e.target.closest('a[data-link]');
    if (link) {
        e.preventDefault();
        navigateTo(link.getAttribute('href'));
    }
});

window.addEventListener('popstate', router);

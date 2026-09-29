import MasterDataCatalogView from './admin/MasterDataCatalogView.js';
import PendingSiteVisitsView from './manager/PendingSiteVisitsView.js';
import InstallationsRegisterView from './manager/InstallationsRegisterView.js';
import CalendarView from './manager/CalendarView.js';
import SupportTicketsHubView from './manager/SupportTicketsHubView.js';

// Engineering (lead_engineer): Inventory is editable; everything else is read-only.
export default class EngineeringWorkspace {
    async render(path) {
        if (path === '/engineering') {
            path = '/engineering/inventory';
            history.replaceState(null, null, path);
        }
        const container = document.createElement('div');
        container.className = 'workspace-layout';

        container.innerHTML = `
            <aside class="sidebar">
                <nav class="sidebar-nav">
                    <div class="sidebar-category">Inventory</div>
                    <a href="/engineering/inventory" class="${path === '/engineering/inventory' ? 'active' : ''}" data-link>Inventory</a>

                    <div class="sidebar-category">Schedule</div>
                    <a href="/engineering/inspections" class="${path === '/engineering/inspections' ? 'active' : ''}" data-link>Pending Inspections</a>
                    <a href="/engineering/installations" class="${path === '/engineering/installations' ? 'active' : ''}" data-link>Pending Installations</a>
                    <a href="/engineering/calendar" class="${path === '/engineering/calendar' ? 'active' : ''}" data-link>Calendar</a>

                    <div class="sidebar-category">Support</div>
                    <a href="/engineering/tickets" class="${path === '/engineering/tickets' ? 'active' : ''}" data-link>Support Tickets</a>
                </nav>
            </aside>
            <main class="main-view" id="engineering-main">
                <!-- Content injected here -->
            </main>
        `;

        const main = container.querySelector('#engineering-main');

        let view;
        if (path === '/engineering/inventory') {
            view = new MasterDataCatalogView();
        } else if (path === '/engineering/inspections') {
            view = new PendingSiteVisitsView({ readOnly: true });
        } else if (path === '/engineering/installations') {
            view = new InstallationsRegisterView({ readOnly: true, pendingOnly: true, title: 'Pending Installations' });
        } else if (path === '/engineering/calendar') {
            view = new CalendarView({ readOnly: true });
        } else if (path === '/engineering/tickets') {
            view = new SupportTicketsHubView({ readOnly: true });
        } else {
            // Unknown engineering page: fall back to the landing page.
            history.replaceState(null, null, '/engineering/inventory');
            return this.render('/engineering/inventory');
        }

        main.innerHTML = '<div class="card"><div class="skeleton skeleton-title" style="width: 30%;"></div><div class="skeleton skeleton-card"></div><div class="skeleton skeleton-table-row"></div><div class="skeleton skeleton-table-row"></div><div class="skeleton skeleton-table-row"></div></div>';
        view.render().then(el => { main.innerHTML = ''; main.appendChild(el); }).catch(e => { main.innerHTML = `<div class="card"><h3 style="color:red">Error</h3><p>${e.message}</p></div>`; });

        return container;
    }
}

import { liveRefresh } from '../../services/realtime.js';
import { fetchSupportTickets, resolveSupportTicket } from '../../services/dataService.js';
import { getActiveProfileId } from '../../components/ActiveProfilePicker.js';
import { escapeHTML } from '../../shared/security.js';
import { formatStatus } from '../../shared/statusFormatter.js';
import { btnContent } from '../../shared/icons.js';

export default class SupportTicketsHubView {
    /** @param {{readOnly?: boolean}} [options] readOnly hides the Resolve action. */
    constructor({ readOnly = false } = {}) {
        this.readOnly = readOnly;
    }

    async render() {
        const container = document.createElement('div');
        container.className = 'card';
        
        container.innerHTML = `
            <h2>Support Tickets</h2>
            <div id="tickets-hub-list" style="margin-top: 1rem;">
                <div class="skeleton skeleton-table-row"></div>
                <div class="skeleton skeleton-table-row"></div>
                <div class="skeleton skeleton-table-row"></div>
                <div class="skeleton skeleton-table-row"></div>
                <div class="skeleton skeleton-table-row"></div>
            </div>
        `;

        this.loadTickets(container.querySelector('#tickets-hub-list'));
        liveRefresh('mgr-tickets', ['support_tickets'], container, () => this.loadTickets(container.querySelector('#tickets-hub-list')));

        return container;
    }

    async loadTickets(container) {
        try {
            const allTickets = await fetchSupportTickets();
            if (allTickets.length === 0) {
                container.innerHTML = '<p>No support tickets.</p>';
                return;
            }
            container.innerHTML = `
                <table style="width: 100%; text-align: left;">
                    <thead><tr><th>Date</th><th>Client</th><th>Subject</th><th>Priority</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>
                        ${allTickets.map(t => `
                            <tr>
                                <td>${new Date(t.createdAt).toLocaleString()}</td>
                                <td>${escapeHTML(t.clientName)}</td>
                                <td>${escapeHTML(t.subject)}</td>
                                <td>${escapeHTML(t.priority)}</td>
                                <td>${escapeHTML(formatStatus(t.status))}</td>
                                <td>
                                    ${t.status === 'OPEN' ? (this.readOnly ? '' : `<button class="resolve-btn btn-sm" data-id="${t.id}" title="Resolve" aria-label="Resolve">${btnContent('check', 'Resolve')}</button>`) : 'Resolved'}
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;

            if (this.readOnly) return;
            container.querySelectorAll('.resolve-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = parseInt(e.target.dataset.id, 10);
                    if (confirm('Mark this ticket as resolved?')) {
                        try {
                            await resolveSupportTicket(id, getActiveProfileId());
                            this.loadTickets(container);
                        } catch(err) {
                            alert('Error resolving ticket: ' + err.message);
                        }
                    }
                });
            });

        } catch (e) {
            container.innerHTML = `<p style="color:red;">Failed to load tickets: ${e.message}</p>`;
        }
    }
}

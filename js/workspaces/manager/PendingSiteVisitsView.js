import { formatDateTime } from '../../shared/dateFormat.js';
import { liveRefresh } from '../../services/realtime.js';
import { getAll, COLLECTIONS } from '../../services/localDb.js';
import { escapeHTML } from '../../shared/security.js';
import { formatStatus } from '../../shared/statusFormatter.js';
import { btnContent } from '../../shared/icons.js';

export default class PendingSiteVisitsView {
    /** @param {{readOnly?: boolean}} [options] readOnly hides the Unlock action. */
    constructor({ readOnly = false } = {}) {
        this.readOnly = readOnly;
    }

    async render() {
        const container = document.createElement('div');
        container.className = 'card';
        
        container.innerHTML = `
            <h2>Pending Inspections</h2>
            <div id="visits-list">Loading...</div>
        `;

        this.loadVisits(container.querySelector('#visits-list'));
        liveRefresh('mgr-pendingvisits', ['ocular_inspections'], container, () => this.loadVisits(container.querySelector('#visits-list')));

        return container;
    }

    async loadVisits(container) {
        try {
            const inspections = await getAll(COLLECTIONS.OCULAR_INSPECTIONS, item => 
                !item.deletedAt && (item.status === 'ASSIGNED_PENDING_INSPECTION' || item.status === 'PENDING_QA')
            );
            inspections.sort((a, b) => b.id - a.id);
            
            if (inspections.length === 0) {
                container.innerHTML = '<p>No pending site visits.</p>';
                return;
            }
            container.innerHTML = `
                <table style="width: 100%; text-align: left;">
                    <thead><tr><th>RN No</th><th>Client</th><th>Address</th><th>Date/Time</th><th>Status</th>${this.readOnly ? '' : '<th>Actions</th>'}</tr></thead>
                    <tbody>
                        ${inspections.map(i => {
                            let showUnlock = false;
                            if (i.scheduledDate && i.status === 'ASSIGNED_PENDING_INSPECTION' && !i.unlockOverride) {
                                const sched = new Date(i.scheduledDate);
                                const now = new Date();
                                sched.setHours(0,0,0,0);
                                now.setHours(0,0,0,0);
                                if (sched > now) showUnlock = true;
                            }
                            return `
                            <tr>
                                <td>${escapeHTML(i.rnNo || 'Draft')}</td>
                                <td>${escapeHTML(i.clientName || 'N/A')}</td>
                                <td>${escapeHTML(i.locationAddress || 'N/A')}</td>
                                <td>${escapeHTML(i.scheduledDate ? new Date(i.scheduledDate).toLocaleString() : formatDateTime(i.dateTime))}</td>
                                <td><span style="padding: 0.2rem 0.5rem; background: #e2e8f0; border-radius: 4px; font-size: 0.85rem;">${escapeHTML(formatStatus(i.status))}</span></td>
                                ${this.readOnly ? '' : `<td>
                                    ${showUnlock ? `<button class="unlock-btn btn-sm" data-id="${i.id}" title="Unlock Early" aria-label="Unlock" style="background: #f59e0b; color: white;">${btnContent('unlock', 'Unlock')}</button>` : ''}
                                </td>`}
                            </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            `;

            if (this.readOnly) return;
            container.querySelectorAll('.unlock-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = parseInt(e.target.dataset.id, 10);
                    const item = inspections.find(x => x.id === id);
                    if (item && confirm('Are you sure you want to unlock this inspection early? The operations team will be able to start it immediately.')) {
                        item.unlockOverride = true;
                        try {
                            // saveOcularInspection is needed, we will import it
                            const { saveOcularInspection } = await import('../../services/dataService.js');
                            await saveOcularInspection(item);
                            this.loadVisits(container);
                        } catch (err) {
                            alert('Error unlocking: ' + err.message);
                        }
                    }
                });
            });
        } catch (e) {
            container.innerHTML = `<p style="color:red;">Error loading visits: ${e.message}</p>`;
        }
    }
}

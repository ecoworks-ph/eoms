import { liveRefresh } from '../../services/realtime.js';
import { fetchPendingInstallations } from '../../services/dataService.js';
import { buildInspectionSummaryHtml } from '../../shared/inspectionSummary.js';
import { escapeHTML } from '../../shared/security.js';
import { btnContent } from '../../shared/icons.js';

export default class ReadyQueueView {
    async render() {
        const container = document.createElement('div');
        container.className = 'card';
        
        container.innerHTML = `<h2>My Installations</h2><div id="ready-list">Loading...</div><div id="preview-container"></div>`;
        
        const listDiv = container.querySelector('#ready-list');
        const previewDiv = container.querySelector('#preview-container');
        
        try {
            const { COLLECTIONS, get } = await import('../../services/localDb.js');
            // Scoped to the signed-in Operations user's own jobs
            const items = await fetchPendingInstallations();
            
            if (items.length === 0) {
                listDiv.innerHTML = `<p>No pending installations.</p>`;
            } else {
                listDiv.innerHTML = `
                    <table style="width: 100%; text-align: left; margin-bottom: 1rem;">
                        <thead><tr><th>Inst No</th><th>Client</th><th>Scheduled Date</th><th>Action</th></tr></thead>
                        <tbody>
                            ${items.map(i => {
                                let isLocked = false;
                                let lockReason = '';
                                if (i.scheduledDate) {
                                    const sched = new Date(i.scheduledDate);
                                    const now = new Date();
                                    sched.setHours(0,0,0,0);
                                    now.setHours(0,0,0,0);
                                    if (sched > now) {
                                        isLocked = true;
                                        lockReason = 'Unlocks on ' + new Date(i.scheduledDate).toLocaleDateString();
                                    }
                                }
                                return `
                                <tr>
                                    <td>${escapeHTML(i.installationNo)}</td>
                                    <td>${escapeHTML(i.clientName)}</td>
                                    <td>${escapeHTML(i.scheduledDate ? new Date(i.scheduledDate).toLocaleString() : 'Not Scheduled')}</td>
                                    <td>
                                        <div class="table-actions">
                                        <button class="btn-sm" data-action="preview" data-id="${i.id}" data-ocular="${i.ocularId}" title="View Inspection Summary" aria-label="View">${btnContent('eye', 'View')}</button>
                                        ${isLocked
                                            ? `<button disabled class="btn-sm" title="${lockReason}" style="background-color:#ccc; color:#666; cursor:not-allowed;" aria-label="Locked">${btnContent('lock', 'Locked')}</button>`
                                            : `<button class="btn-sm" data-action="start" data-id="${i.id}" title="Start Install" aria-label="Install" style="background-color: var(--brand-green); color: white;">${btnContent('wrench', 'Install')}</button>`
                                        }
                                        </div>
                                    </td>
                                </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                `;
                
                listDiv.addEventListener('click', async (e) => {
                    const btn = e.target.closest('button');
                    if (!btn) return;
                    const id = parseInt(btn.dataset.id, 10);
                    const item = items.find(x => x.id === id);
                    
                    if (btn.dataset.action === 'preview') {
                        const ocularId = parseInt(btn.dataset.ocular, 10);
                        const ocular = await get(COLLECTIONS.OCULAR_INSPECTIONS, ocularId);
                        if (ocular) {
                            previewDiv.innerHTML = buildInspectionSummaryHtml(ocular);
                        } else {
                            previewDiv.innerHTML = '<p>Inspection record not found.</p>';
                        }
                    } else if (btn.dataset.action === 'start') {
                        window.history.pushState(null, '', '/ocular/installation');
                        window.dispatchEvent(new PopStateEvent('popstate'));
                    }
                });
            }
        } catch (e) {
            listDiv.innerHTML = `<p style="color:red">Error: ${e.message}</p>`;
        }
        
        liveRefresh('ops-ready', ['installation_records'], container, async () => {
            const fresh = await this.render();
            if (container.isConnected) container.replaceWith(fresh);
        });

        return container;
    }
}

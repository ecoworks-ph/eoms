import { liveRefresh } from '../../services/realtime.js';
import { fetchAllAssignedInspections } from '../../services/dataService.js';
import { getActiveProfileId } from '../../components/ActiveProfilePicker.js';
import { escapeHTML } from '../../shared/security.js';
import { navigateTo } from '../../components/Router.js';
import { btnContent } from '../../shared/icons.js';

export default class AssignedQueueView {
    async render() {
        const container = document.createElement('div');
        container.className = 'card';
        
        container.innerHTML = `<h2>My Inspections</h2><div id="assigned-list">Loading...</div>`;
        
        const listDiv = container.querySelector('#assigned-list');
        
        try {
            // Scoped to the signed-in Operations user's own jobs (see dataService)
            const items = await fetchAllAssignedInspections();
            items.sort((a, b) => b.id - a.id);
            
            if (items.length === 0) {
                listDiv.innerHTML = '<p>No assigned inspections.</p>';
            } else {
                listDiv.innerHTML = `
                    <table style="width: 100%; text-align: left; border-collapse: collapse;">
                        <thead>
                            <tr style="border-bottom: 2px solid #ccc;">
                                <th style="padding: 0.5rem;">RN No</th>
                                <th style="padding: 0.5rem;">Client</th>
                                <th style="padding: 0.5rem;">Address</th>
                                <th style="padding: 0.5rem;">Scheduled For</th>
                                <th style="padding: 0.5rem;">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${items.map(i => {
                                let isLocked = false;
                                let lockReason = '';
                                if (i.scheduledDate) {
                                    const sched = new Date(i.scheduledDate);
                                    const now = new Date();
                                    // Strip time to compare just the calendar day
                                    sched.setHours(0,0,0,0);
                                    now.setHours(0,0,0,0);
                                    
                                    if (sched > now && !i.unlockOverride) {
                                        isLocked = true;
                                        lockReason = 'Unlocks on ' + new Date(i.scheduledDate).toLocaleDateString();
                                    }
                                }
                                
                                return `
                                <tr style="border-bottom: 1px solid #eee;">
                                    <td style="padding: 0.5rem;">${escapeHTML(i.rnNo)}</td>
                                    <td style="padding: 0.5rem;">${escapeHTML(i.clientName)}</td>
                                    <td style="padding: 0.5rem;">${escapeHTML(i.locationAddress || 'N/A')}</td>
                                    <td style="padding: 0.5rem; font-weight: bold;">${escapeHTML(i.scheduledDate ? new Date(i.scheduledDate).toLocaleString() : 'Not Scheduled')}</td>
                                    <td style="padding: 0.5rem;">
                                        ${isLocked 
                                            ? `<button disabled class="btn-sm" title="${lockReason}" style="background-color:#ccc; color:#666; cursor:not-allowed;" aria-label="Locked">${btnContent('lock', 'Locked')}</button>`
                                            : `<button class="start-inspection-btn btn-sm" data-id="${i.id}" data-rn="${escapeHTML(i.rnNo)}" title="Start Inspection" aria-label="Start" style="background-color: var(--brand-green); color: white;">${btnContent('play', 'Start')}</button>`
                                        }
                                    </td>
                                </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                `;

                listDiv.querySelectorAll('.start-inspection-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        const id = e.target.dataset.id;
                        sessionStorage.setItem('currentOcularDraftId', id);
                        navigateTo('/ocular');
                    });
                });
            }
        } catch (e) {
            listDiv.innerHTML = `<p style="color:red">Error: ${e.message}</p>`;
        }
        
        liveRefresh('ops-assigned', ['ocular_inspections'], container, async () => {
            const fresh = await this.render();
            if (container.isConnected) container.replaceWith(fresh);
        });

        return container;
    }
}

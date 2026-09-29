import { getAll, COLLECTIONS } from '../../services/localDb.js';
import { escapeHTML } from '../../shared/security.js';
import { formatStatus } from '../../shared/statusFormatter.js';
import { btnContent } from '../../shared/icons.js';

export default class CalendarView {
    /** @param {{readOnly?: boolean}} [options] The calendar has no edit actions today; the flag is kept for parity. */
    constructor({ readOnly = false } = {}) {
        this.readOnly = readOnly;
        const today = new Date();
        this.currentMonth = today.getMonth();
        this.currentYear = today.getFullYear();
        this.oculars = [];
        this.installs = [];
    }

    async render() {
        this.container = document.createElement('div');
        this.container.className = 'card';
        
        this.container.innerHTML = `
            <div class="page-header">
                <h2>Calendar</h2>
                <div class="toolbar">
                    <button type="button" id="prev-month" class="cal-nav-btn" aria-label="Previous month">${btnContent('chevron-left', 'Prev')}</button>
                    <span id="month-label" style="font-size: 1.2rem; font-weight: bold; min-width: 150px; text-align: center;"></span>
                    <button type="button" id="next-month" class="cal-nav-btn" aria-label="Next month">${btnContent('chevron-right', 'Next', true)}</button>
                </div>
            </div>
            <div id="calendar-container">Loading...</div>
        `;
        
        this.container.querySelector('#prev-month').addEventListener('click', () => {
            this.currentMonth--;
            if (this.currentMonth < 0) {
                this.currentMonth = 11;
                this.currentYear--;
            }
            this.renderGrid();
        });

        this.container.querySelector('#next-month').addEventListener('click', () => {
            this.currentMonth++;
            if (this.currentMonth > 11) {
                this.currentMonth = 0;
                this.currentYear++;
            }
            this.renderGrid();
        });

        try {
            this.oculars = await getAll(COLLECTIONS.OCULAR_INSPECTIONS, i => i.scheduledDate && !i.deletedAt);
            this.installs = await getAll(COLLECTIONS.INSTALLATION_RECORDS, i => i.scheduledDate && !i.deletedAt);
            this.renderGrid();
        } catch(e) {
            this.container.querySelector('#calendar-container').innerHTML = `<p style="color:red">Error loading calendar: ${e.message}</p>`;
        }
        
        return this.container;
    }

    renderGrid() {
        const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        this.container.querySelector('#month-label').textContent = `${monthNames[this.currentMonth]} ${this.currentYear}`;

        const firstDay = new Date(this.currentYear, this.currentMonth, 1).getDay();
        const daysInMonth = new Date(this.currentYear, this.currentMonth + 1, 0).getDate();

        let html = `
            <div style="display: grid; grid-template-columns: repeat(7, 1fr); gap: 1px; background: #e2e8f0; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
                ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => `
                    <div style="background: #f8fafc; padding: 0.75rem; text-align: center; font-weight: bold; font-size: 0.9rem; color: #475569;">${day}</div>
                `).join('')}
        `;

        // Pad start
        for (let i = 0; i < firstDay; i++) {
            html += `<div style="background: white; min-height: 120px;"></div>`;
        }

        // Days
        for (let day = 1; day <= daysInMonth; day++) {
            // Use strict local string padding to avoid timezone offset shifts from toISOString()
            const dateStr = `${this.currentYear}-${String(this.currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            const dayOculars = this.oculars.filter(o => o.scheduledDate && o.scheduledDate.startsWith(dateStr));
            const dayInstalls = this.installs.filter(ins => ins.scheduledDate && ins.scheduledDate.startsWith(dateStr));
            
            const today = new Date();
            const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
            const isToday = todayStr === dateStr;
            const bg = isToday ? 'var(--brand-blue-soft)' : 'white';

            html += `
                <div style="background: ${bg}; min-height: 120px; padding: 0.5rem; display: flex; flex-direction: column;">
                    <div style="text-align: right; font-size: 0.9rem; font-weight: ${isToday ? 'bold' : 'normal'}; color: ${isToday ? 'var(--brand-blue)' : '#64748b'}; margin-bottom: 0.5rem;">${day}</div>
            `;

            dayOculars.forEach(o => {
                html += `
                    <div class="calendar-event" data-type="ocular" data-id="${o.id}" style="cursor: pointer; background: #dbeafe; border-left: 3px solid #3b82f6; padding: 0.25rem 0.5rem; margin-bottom: 0.25rem; font-size: 0.75rem; border-radius: 2px; color: #1e3a8a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="Inspection: ${escapeHTML(o.clientName)}">
                        <strong>Inspection:</strong> ${escapeHTML(o.clientName)}
                    </div>`;
            });
            
            dayInstalls.forEach(ins => {
                html += `
                    <div class="calendar-event" data-type="install" data-id="${ins.id}" style="cursor: pointer; background: #d1fae5; border-left: 3px solid #10b981; padding: 0.25rem 0.5rem; margin-bottom: 0.25rem; font-size: 0.75rem; border-radius: 2px; color: #064e3b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="Install: ${escapeHTML(ins.clientName)}">
                        <strong>Install:</strong> ${escapeHTML(ins.clientName)}
                    </div>`;
            });

            html += `</div>`;
        }

        // Pad end
        const totalCells = firstDay + daysInMonth;
        const remainder = totalCells % 7;
        if (remainder !== 0) {
            for (let i = 0; i < 7 - remainder; i++) {
                html += `<div style="background: white; min-height: 120px;"></div>`;
            }
        }

        html += `</div>`;
        this.container.querySelector('#calendar-container').innerHTML = html;

        // Bind event clicks
        this.container.querySelectorAll('.calendar-event').forEach(el => {
            el.addEventListener('click', () => {
                const type = el.dataset.type;
                const id = parseInt(el.dataset.id, 10);
                const event = type === 'ocular' 
                    ? this.oculars.find(o => o.id === id) 
                    : this.installs.find(i => i.id === id);
                
                if (event) this.showEventDetails(type, event);
            });
        });
    }

    showEventDetails(type, event) {
        const modal = document.createElement('div');
        modal.style.position = 'fixed';
        modal.style.top = '0'; modal.style.left = '0'; modal.style.width = '100%'; modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
        modal.style.display = 'flex'; modal.style.justifyContent = 'center'; modal.style.alignItems = 'center';
        modal.style.zIndex = '2000';
        
        const title = type === 'ocular' ? 'Inspection Details' : 'Installation Details';
        const refNo = type === 'ocular' ? event.rnNo : event.installationNo;
        const addr = type === 'ocular' ? event.locationAddress : event.installationAddress;
        
        modal.innerHTML = `
            <div style="background: white; padding: 2rem; border-radius: 8px; width: 450px; max-width: 90vw;">
                <h3 style="margin-top: 0; border-bottom: 1px solid #e2e8f0; padding-bottom: 0.5rem;">${title}</h3>
                <div style="margin-bottom: 1.5rem; line-height: 1.6;">
                    <strong>Client:</strong> ${escapeHTML(event.clientName)}<br>
                    <strong>Ref No:</strong> ${escapeHTML(refNo || 'N/A')}<br>
                    <strong>Schedule:</strong> ${new Date(event.scheduledDate).toLocaleString()}<br>
                    <strong>Status:</strong> <span style="background: #e2e8f0; padding: 2px 6px; border-radius: 4px; font-size: 0.85rem;">${escapeHTML(formatStatus(event.status))}</span><br>
                    <strong>Assigned Team ID:</strong> ${event.assignedTeam || 'Unassigned'}<br>
                    <strong>Address:</strong> ${escapeHTML(addr || 'N/A')}
                </div>
                <div class="modal-actions" style="margin-top: 0;">
                    <button id="close-modal-btn" style="background: #e2e8f0; color: #333; border-radius: 4px;">${btnContent('x', 'Close')}</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        modal.querySelector('#close-modal-btn').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        // click outside to close
        modal.addEventListener('click', (e) => {
            if (e.target === modal) document.body.removeChild(modal);
        });
    }
}

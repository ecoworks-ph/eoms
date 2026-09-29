import { formatDateTime } from '../../shared/dateFormat.js';
import { fetchAllInstallations } from '../../services/dataService.js';
import { escapeHTML } from '../../shared/security.js';
import { formatStatus } from '../../shared/statusFormatter.js';
import { printInstallationRegister } from '../../shared/certificates.js';
import { btnContent } from '../../shared/icons.js';

// Installation statuses that count as done (or no longer pending).
const FINISHED_INSTALL_STATUSES = new Set(['COMMISSIONED', 'INSTALLATION_COMPLETE', 'JOB_CHECKOUT_COMPLETE', 'CANCELED']);

export default class InstallationsRegisterView {
    /**
     * @param {{readOnly?: boolean, pendingOnly?: boolean, title?: string}} [options]
     * pendingOnly lists only installations not yet completed. readOnly is accepted
     * for parity (the register's only action is Print, which stays).
     */
    constructor({ readOnly = false, pendingOnly = false, title = 'Installations' } = {}) {
        this.readOnly = readOnly;
        this.pendingOnly = pendingOnly;
        this.title = title;
    }

    async render() {
        const container = document.createElement('div');
        container.className = 'card';
        
        container.innerHTML = `
            <h2>${escapeHTML(this.title)}</h2>
            <div id="installations-table-container" style="margin-top: 1rem;">
                <div class="skeleton skeleton-table-row"></div>
                <div class="skeleton skeleton-table-row"></div>
                <div class="skeleton skeleton-table-row"></div>
                <div class="skeleton skeleton-table-row"></div>
                <div class="skeleton skeleton-table-row"></div>
            </div>
        `;

        this.loadInstallations(container.querySelector('#installations-table-container'));

        return container;
    }

    async loadInstallations(container) {
        try {
            let installations = await fetchAllInstallations();
            if (this.pendingOnly) {
                installations = installations.filter(i => !i.deletedAt && !FINISHED_INSTALL_STATUSES.has(i.status));
            }
            if (installations.length === 0) {
                container.innerHTML = this.pendingOnly ? '<p>No pending installations.</p>' : '<p>No installations found.</p>';
                return;
            }
            container.innerHTML = `
                <table style="width: 100%; text-align: left;">
                    <thead><tr><th>Inst. No</th><th>Client Name</th><th>Date</th><th>Status</th><th>Actions</th></tr></thead>
                    <tbody>
                        ${installations.map(i => `
                            <tr>
                                <td>${escapeHTML(i.installationNo)}</td>
                                <td>${escapeHTML(i.clientName)}</td>
                                <td>${escapeHTML(formatDateTime(i.dateTime))}</td>
                                <td>${escapeHTML(formatStatus(i.status))}</td>
                                <td>
                                    <button class="print-btn btn-sm" data-id="${i.id}" title="Print Register" aria-label="Print Register">${btnContent('printer', 'Print Register')}</button>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;

            container.querySelectorAll('.print-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const id = parseInt(e.target.dataset.id, 10);
                    const record = installations.find(ins => ins.id === id);
                    if (record) printInstallationRegister(record);
                });
            });
        } catch (e) {
            container.innerHTML = `<p style="color:red;">Failed to load installations: ${e.message}</p>`;
        }
    }
}

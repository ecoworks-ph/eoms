import { liveRefresh } from '../../services/realtime.js';
import { fetchAllSalesLeads, createSalesLead, updateSalesLeadStage, bulkImportSalesLeads, archiveSalesLead, dispatchOcularFromLead, CHECKLIST_STAGES } from '../../services/dataService.js';
import { getActiveProfileId } from '../../components/ActiveProfilePicker.js';
import { escapeHTML } from '../../shared/security.js';
import { formatStatus } from '../../shared/statusFormatter.js';
import { getProfiles } from '../../services/userService.js';
import { getItemsByCategory } from '../../services/masterDataService.js';
import { btnContent, icon } from '../../shared/icons.js';

// Same three options as the ocular inspection form's Type of Residency select (no blank default).
const RESIDENCY_OPTIONS = ['Residential', 'Commercial', 'Industrial'];
// Same four defaults as the ocular inspection form's Scope of Works select; catalog items are appended after.
const SCOPE_DEFAULT_OPTIONS = ['Site Inspection', 'Installation', 'Revisit', 'Checking'];

async function loadScopeCatalogNames() {
    try {
        const items = await getItemsByCategory('scopes');
        return items.map(i => i.itemName).filter(Boolean);
    } catch (e) {
        console.error('Failed to load scope catalog:', e);
        return [];
    }
}

function scopeOptionsHtml(selected, catalogExtra) {
    return [...SCOPE_DEFAULT_OPTIONS, ...(catalogExtra || [])]
        .map(s => `<option value="${escapeHTML(s)}" ${selected === s ? 'selected' : ''}>${escapeHTML(s)}</option>`).join('');
}

function residencyOptionsHtml(selected) {
    return RESIDENCY_OPTIONS.map(b => `<option value="${b}" ${selected === b ? 'selected' : ''}>${b}</option>`).join('');
}

/** Split a full "Client Name" on the LAST space: last word -> lastName, the rest -> firstName. Single word -> firstName only. */
function splitClientName(full) {
    const s = String(full || '').trim();
    if (!s) return { firstName: '', lastName: '' };
    const i = s.lastIndexOf(' ');
    if (i === -1) return { firstName: s, lastName: '' };
    return { firstName: s.slice(0, i).trim(), lastName: s.slice(i + 1).trim() };
}

// Crew picker for dispatch modals: active Operations crew only, no default selection.
async function buildCrewSelectHtml(selectId) {
    let crew = [];
    try {
        const profiles = await getProfiles();
        crew = profiles.filter(p => p.role === 'operations' && (!p.status || p.status === 'ACTIVE') && !p.deletedAt);
        crew.sort((a, b) => String(a.fullName || '').localeCompare(String(b.fullName || '')));
    } catch (e) {
        console.error('Failed to load crew list:', e);
    }
    if (crew.length === 0) {
        return `<select id="${selectId}" disabled><option value="">No active Operations users</option></select>`;
    }
    return `<select id="${selectId}" required>
        <option value="" selected disabled>Select crew member…</option>
        ${crew.map(p => `<option value="${Number(p.id)}">${escapeHTML(p.fullName || p.email || ('User ' + p.id))}</option>`).join('')}
    </select>`;
}

// Checklist steps whose Excel date is a *scheduled* date rather than a completion date.
const SCHEDULED_STEPS = new Set(['SITE_VISIT_COMPLETED', 'INSTALLATION_SCHEDULED']);
const MODE_SUGGESTIONS = ['Call', 'Text', 'Viber', 'Email', 'Messenger', 'Website', 'Walk-in'];
const modeDatalist = (id) => `<datalist id="${id}">${MODE_SUGGESTIONS.map(m => `<option value="${m}"></option>`).join('')}</datalist>`;

const leadName = (l) => l.name || [l.firstName, l.lastName].filter(Boolean).join(' ');
const fullName = (first, last) => [first, last].map(v => String(v || '').trim()).filter(Boolean).join(' ');

/** Escape text, then turn http(s) URLs into links that open in a new tab. */
function linkify(text) {
    return escapeHTML(text || '').replace(/https?:\/\/[^\s<]+/g, (m) => {
        const trail = (m.match(/[.,;:!?)\]]+$/) || [''])[0];
        const url = trail ? m.slice(0, -trail.length) : m;
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>${trail}`;
    });
}

function checklistOf(l) {
    return (l.stageChecklist && typeof l.stageChecklist === 'object') ? l.stageChecklist : {};
}

/** Read-only progress timeline for the details panel. */
function timelineHtml(l) {
    const cl = checklistOf(l);
    return `<ol class="lead-timeline">${CHECKLIST_STAGES.map(code => {
        const st = cl[code] || {};
        const word = SCHEDULED_STEPS.has(code) ? 'Scheduled' : 'Done';
        return `<li class="${st.done ? 'is-done' : ''}${code === l.stage ? ' is-current' : ''}" data-step="${code}">
            <span class="lead-timeline__tick" aria-hidden="true">${st.done ? '&#10003;' : ''}</span>
            <span class="lead-timeline__label">${escapeHTML(formatStatus(code))}</span>
            <span class="lead-timeline__date">${st.date ? `${word}: ${escapeHTML(st.date)}` : (st.done ? word : '—')}</span>
        </li>`;
    }).join('')}</ol>`;
}

function detailItem(label, val) {
    return `<div class="lead-detail"><div class="lead-detail__k">${label}</div><div class="lead-detail__v">${val || '—'}</div></div>`;
}

/** Read-only Details modal body: same fields as the old inline details row. */
function detailsModalHtml(l) {
    const created = l.createdAt ? new Date(l.createdAt).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: 'short', day: 'numeric' }) : '';
    return `
        <div class="lead-details__grid">
            ${detailItem('RN No.', escapeHTML(l.rnNo))}
            ${detailItem('Contact Number', escapeHTML(l.phone || l.contactInfo))}
            ${detailItem('Email', escapeHTML(l.email))}
            ${detailItem('Installation Address', escapeHTML(l.installationAddress))}
            ${detailItem('Mode of Communication', escapeHTML(l.modeOfCommunication))}
            ${detailItem('Type of Residency', escapeHTML(l.buildingType))}
            ${detailItem('Scope of Works', escapeHTML(l.scopeOfWorks))}
            ${detailItem('Dispatch', l.ocularId ? 'Dispatched' : 'Pending')}
            ${detailItem('Created', escapeHTML(created))}
        </div>
        <div class="lead-details__section"><div class="lead-detail__k">Progress</div>${timelineHtml(l)}</div>
        <div class="lead-details__grid">
            ${detailItem('Remarks', linkify(l.remarks) && `<div class="lead-remarks">${linkify(l.remarks)}</div>`)}
            ${detailItem('Follow-up 1', linkify(l.followUp1) && `<div class="lead-remarks">${linkify(l.followUp1)}</div>`)}
            ${detailItem('Follow-up 2', linkify(l.followUp2) && `<div class="lead-remarks">${linkify(l.followUp2)}</div>`)}
        </div>
    `;
}

function leadMatches(l, q) {
    if (!q) return true;
    return [leadName(l), l.clientId, l.rnNo, l.phone, l.email, l.contactInfo, l.installationAddress]
        .some(v => v && String(v).toLowerCase().includes(q));
}

export const STAGES = [
    'INITIAL_CONTACT',
    'SITE_VISIT_SCHEDULED',
    'SITE_VISIT_COMPLETED',
    'QUOTE_SENT',
    'QUOTE_ACCEPTED',
    'INSTALLATION_SCHEDULED',
    'INSTALLATION_COMPLETE',
    'JOB_CHECKOUT_COMPLETE',
    'CANCELED'
];

export default class SalesPipelineView {
    async render() {
        const container = document.createElement('div');
        container.className = 'card';
        
        container.innerHTML = `
            <div class="page-header">
                <h2>Clients</h2>
                <div class="toolbar">
                    <button type="button" id="add-client-btn" aria-haspopup="dialog">${btnContent('plus', 'Add Client')}</button>
                    <button type="button" id="bulk-import-btn" style="background-color: #64748b; color: white;">${btnContent('upload', 'Bulk Import (Mock)')}</button>
                </div>
            </div>
            <div class="form-row" style="margin-bottom: 1rem;">
                <div class="form-group">
                    <label for="lead-search">Search clients</label>
                    <input type="search" id="lead-search" placeholder="Name, Installation No., RN No., phone or email">
                </div>
                <div class="form-group">
                    <label for="stage-filter">Stage</label>
                    <select id="stage-filter"><option value="">All stages</option></select>
                </div>
            </div>
            <div id="pipeline-table-container">
                <div class="skeleton skeleton-title"></div>
                <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 1rem; margin-bottom: 2rem;">
                    <div class="skeleton skeleton-card"></div>
                    <div class="skeleton skeleton-card"></div>
                    <div class="skeleton skeleton-card"></div>
                    <div class="skeleton skeleton-card"></div>
                </div>
                <div class="skeleton skeleton-table-row"></div>
                <div class="skeleton skeleton-table-row"></div>
                <div class="skeleton skeleton-table-row"></div>
            </div>
        `;

        const addBtn = container.querySelector('#add-client-btn');
        addBtn.addEventListener('click', () => { this.openAddClientModal(container.querySelector('#pipeline-table-container'), addBtn); });

        const bulkBtn = container.querySelector('#bulk-import-btn');
        bulkBtn.addEventListener('click', async () => {
            if (confirm('Import 3 mock leads?')) {
                const rows = [
                    { legacyRowId: 'MOCK1', name: 'Corp A', email: 'a@corp.com', phone: '09171234567', installationAddress: '123 Main St', modeOfCommunication: 'Phone', remarks: '', createdBy: getActiveProfileId(), stage: 'INITIAL_CONTACT', stageINITIAL_CONTACTAt: new Date().toISOString() },
                    { legacyRowId: 'MOCK2', name: 'Corp B', email: 'b@corp.com', phone: '09177654321', installationAddress: '456 Side St', modeOfCommunication: 'Email', remarks: '', createdBy: getActiveProfileId(), stage: 'SITE_VISIT_SCHEDULED', stageSITE_VISIT_SCHEDULEDAt: new Date().toISOString() },
                    { legacyRowId: 'MOCK3', name: 'Corp C', email: 'c@corp.com', phone: '09181112222', installationAddress: '789 High St', modeOfCommunication: 'Website', remarks: '', createdBy: getActiveProfileId(), stage: 'INITIAL_CONTACT', stageINITIAL_CONTACTAt: new Date().toISOString() }
                ];
                for (const r of rows) await createSalesLead(r);
                this.refreshLeads(container.querySelector('#pipeline-table-container'));
            }
        });

        this.searchQuery = '';
        container.querySelector('#lead-search').addEventListener('input', (e) => {
            this.searchQuery = e.target.value.trim().toLowerCase();
            this.currentPage = 1;
            this.loadPipeline(container.querySelector('#pipeline-table-container'));
        });

        this.stageFilter = '';
        container.querySelector('#stage-filter').addEventListener('change', (e) => {
            this.stageFilter = e.target.value;
            this.currentPage = 1;
            this.loadPipeline(container.querySelector('#pipeline-table-container'));
        });

        this.loadPipeline(container.querySelector('#pipeline-table-container'));
        liveRefresh('mgr-pipeline', ['sales_leads'], container, () => {
            this.allLeads = null; // force refetch
            return this.loadPipeline(container.querySelector('#pipeline-table-container'));
        });

        return container;
    }

    /** Refetch leads after a local change so the row updates now, keeping the loaded page count. */
    refreshLeads(container) {
        this.keepPage = this.currentPage;
        this.allLeads = null;
        return this.loadPipeline(container);
    }

    /** Add Client popup: same fields, labels, order and required marks as the New Inspection form's Step 1. */
    async openAddClientModal(container, triggerBtn) {
        const scopeCatalog = await loadScopeCatalogNames();
        const titleId = 'add-client-title';
        const hintId = 'add-client-hint';
        const modal = document.createElement('div');
        modal.style.position = 'fixed';
        modal.style.top = '0'; modal.style.left = '0'; modal.style.width = '100%'; modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
        modal.style.display = 'flex'; modal.style.justifyContent = 'center'; modal.style.alignItems = 'center';
        modal.style.zIndex = '1000';

        // Portrait, single-column, sectioned to match the New Inspection form's fields/keys/required rules.
        // inputId is reused for the label's `for`, the field's own id and its error paragraph's id (inputId + "-err").
        const field = (inputId, labelText, inputHtmlBuilder) => `
            <div class="form-group">
                <label for="${inputId}">${labelText}</label>
                ${inputHtmlBuilder(inputId, `${inputId}-err`)}
                <p class="field-error" id="${inputId}-err" role="alert"></p>
            </div>`;

        modal.innerHTML = `
            <div role="dialog" aria-modal="true" aria-labelledby="${titleId}" aria-describedby="${hintId}" tabindex="-1" id="add-client-dialog">
                <div class="add-client-header">
                    <div>
                        <h3 id="${titleId}">Add Client</h3>
                        <p id="${hintId}" class="add-client-hint">Fields marked * are required</p>
                    </div>
                    <button type="button" id="add-lead-close-x" class="icon-btn" aria-label="Close">${icon('x')}</button>
                </div>
                <form id="add-lead-form" class="form-stack" novalidate>
                    <div class="add-client-scroll">
                        <h4 class="crm-section-title">Client</h4>
                        ${field('add-lead-clientName', 'Client Name *', (id, errId) => `<input type="text" id="${id}" name="clientName" required autocomplete="name" aria-describedby="${errId}">`)}
                        <div class="form-group">
                            <label for="add-lead-phone">Contact No</label>
                            <input type="tel" id="add-lead-phone" name="phone" inputmode="tel" autocomplete="tel">
                        </div>

                        <h4 class="crm-section-title">Job references</h4>
                        ${field('add-lead-rnNo', 'RN No *', (id, errId) => `<input type="text" id="${id}" name="rnNo" required autocomplete="off" spellcheck="false" aria-describedby="${errId}">`)}
                        ${field('add-lead-clientId', 'Installation No *', (id, errId) => `<input type="text" id="${id}" name="clientId" required autocomplete="off" spellcheck="false" aria-describedby="${errId}">`)}

                        <h4 class="crm-section-title">Site</h4>
                        <div class="form-group">
                            <label for="add-lead-scope">Scope of Works</label>
                            <select id="add-lead-scope" name="scopeOfWorks">${scopeOptionsHtml('', scopeCatalog)}</select>
                        </div>
                        ${field('add-lead-residency', 'Type of Residency *', (id, errId) => `<select id="${id}" name="buildingType" required aria-describedby="${errId}">${residencyOptionsHtml('')}</select>`)}
                        ${field('add-lead-address', 'Location Address *', (id, errId) => `<textarea id="${id}" name="installationAddress" required rows="2" aria-describedby="${errId}"></textarea>`)}
                    </div>
                    <div class="add-client-footer">
                        <p class="field-error" id="add-lead-form-error" role="alert"></p>
                        <div class="modal-actions" style="margin: 0;">
                            <button type="button" id="add-lead-cancel-btn" style="background: #e2e8f0; color: #333;">${btnContent('x', 'Cancel')}</button>
                            <button type="submit" id="add-lead-submit-btn">${btnContent('plus', 'Add Client')}</button>
                        </div>
                    </div>
                </form>
            </div>
        `;

        const dialog = modal.querySelector('[role="dialog"]');
        const form = modal.querySelector('#add-lead-form');
        const submitBtn = modal.querySelector('#add-lead-submit-btn');
        const submitIdleHtml = submitBtn.innerHTML;
        const submitBusyHtml = btnContent('save', 'Saving…');
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
        const closeModal = () => {
            document.body.style.overflow = prevOverflow;
            document.removeEventListener('keydown', onKeydown);
            if (modal.parentNode) document.body.removeChild(modal);
            if (triggerBtn && document.contains(triggerBtn)) triggerBtn.focus();
        };
        const onKeydown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeModal();
                return;
            }
            if (e.key === 'Tab') {
                const focusable = Array.from(dialog.querySelectorAll(focusableSelector)).filter(el => !el.disabled);
                if (focusable.length === 0) return;
                const first = focusable[0], last = focusable[focusable.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault(); last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault(); first.focus();
                }
            }
        };
        document.addEventListener('keydown', onKeydown);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        modal.querySelector('#add-lead-cancel-btn').addEventListener('click', closeModal);
        modal.querySelector('#add-lead-close-x').addEventListener('click', closeModal);

        // Inline, per-field error text (instead of one banner) so the message sits next to the field it belongs to.
        const formErrEl = form.querySelector('#add-lead-form-error');
        const clearFieldErrors = () => form.querySelectorAll('.field-error').forEach(el => { el.textContent = ''; });
        const showFieldError = (fieldName, msg) => {
            clearFieldErrors();
            const input = form.querySelector(`[name="${fieldName}"]`);
            const errId = input && input.getAttribute('aria-describedby');
            const errEl = errId && form.querySelector(`#${errId}`);
            if (errEl) errEl.textContent = msg;
            if (input) input.focus();
        };
        const labelFor = (el) => (el.closest('.form-group')?.querySelector('label')?.textContent || 'This field').replace(/\s*\*\s*$/, '');

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            clearFieldErrors();
            // novalidate: run the browser checks ourselves so the first invalid field gets focus and an inline message.
            const invalid = Array.from(form.elements).find(el => el.willValidate && !el.checkValidity());
            if (invalid) {
                showFieldError(invalid.name, `${labelFor(invalid)} is required.`);
                return;
            }
            const formData = new FormData(form);
            const val = (k) => String(formData.get(k) || '').trim();
            const clientName = val('clientName');
            if (!clientName) {
                showFieldError('clientName', 'Client Name is required.');
                return;
            }
            const { firstName, lastName } = splitClientName(clientName);
            const phone = val('phone');
            const lead = {
                clientId: val('clientId'),
                rnNo: val('rnNo'),
                firstName,
                lastName,
                name: clientName,
                phone,
                contactInfo: phone,
                installationAddress: val('installationAddress'),
                buildingType: val('buildingType'),
                scopeOfWorks: val('scopeOfWorks'),
                remarks: '',
                followUp1: '',
                followUp2: '',
                createdBy: getActiveProfileId()
            };
            submitBtn.disabled = true;
            submitBtn.setAttribute('aria-busy', 'true');
            submitBtn.innerHTML = submitBusyHtml;
            try {
                await createSalesLead(lead);
            } catch (err) {
                submitBtn.disabled = false;
                submitBtn.removeAttribute('aria-busy');
                submitBtn.innerHTML = submitIdleHtml;
                formErrEl.textContent = 'Error creating client: ' + (err && err.message ? err.message : err);
                return;
            }
            form.reset();
            closeModal();
            await this.refreshLeads(container);
            this.highlightLead(container, lead.id);
        });

        document.body.appendChild(modal);
        form.querySelector('[name="clientName"]').focus();
    }

    /** Briefly highlight a freshly added row and scroll it into view (no-op if it is filtered out). */
    highlightLead(container, id) {
        if (id == null) return;
        const row = container.querySelector(`tr.lead-row[data-id="${CSS.escape(String(id))}"]`);
        if (!row) return;
        row.classList.add('lead-row--new');
        row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        setTimeout(() => row.classList.remove('lead-row--new'), 2500);
    }

    /** Read-only Details popup: client info, progress timeline and remarks. Edit hands off to the CRM Profile modal. */
    openDetailsModal(id, container, triggerBtn) {
        const lead = (this.allLeads || []).find(l => l.id === id);
        if (!lead) return;

        const titleId = `lead-details-title-${id}`;
        const modal = document.createElement('div');
        modal.style.position = 'fixed';
        modal.style.top = '0'; modal.style.left = '0'; modal.style.width = '100%'; modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
        modal.style.display = 'flex'; modal.style.justifyContent = 'center'; modal.style.alignItems = 'center';
        modal.style.zIndex = '1000';

        modal.innerHTML = `
            <div role="dialog" aria-modal="true" aria-labelledby="${titleId}" tabindex="-1"
                 style="background: white; padding: 2rem; border-radius: 8px; width: 640px; max-width: 90vw; max-height: 90vh; overflow-y: auto;">
                <div class="page-header" style="margin-bottom: 1.5rem;">
                    <h3 id="${titleId}">${escapeHTML(lead.clientId || '')}${lead.clientId ? ' — ' : ''}${escapeHTML(leadName(lead))}</h3>
                    <span style="background: #e2e8f0; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.85rem;">${escapeHTML(formatStatus(lead.stage))}</span>
                </div>
                ${detailsModalHtml(lead)}
                <div class="modal-actions">
                    <button type="button" id="lead-details-edit-btn" class="btn-sm" style="background-color: #6366f1; color: white;">${btnContent('pencil', 'Edit')}</button>
                    <button type="button" id="lead-details-close-btn" class="btn-sm" style="background: #e2e8f0; color: #333;">${btnContent('x', 'Close')}</button>
                </div>
            </div>
        `;

        const dialog = modal.querySelector('[role="dialog"]');
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';

        const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
        const closeModal = () => {
            document.body.style.overflow = prevOverflow;
            document.removeEventListener('keydown', onKeydown);
            if (modal.parentNode) document.body.removeChild(modal);
            if (triggerBtn && document.contains(triggerBtn)) triggerBtn.focus();
        };
        const onKeydown = (e) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                closeModal();
                return;
            }
            if (e.key === 'Tab') {
                const focusable = Array.from(dialog.querySelectorAll(focusableSelector));
                if (focusable.length === 0) return;
                const first = focusable[0], last = focusable[focusable.length - 1];
                if (e.shiftKey && document.activeElement === first) {
                    e.preventDefault(); last.focus();
                } else if (!e.shiftKey && document.activeElement === last) {
                    e.preventDefault(); first.focus();
                }
            }
        };
        document.addEventListener('keydown', onKeydown);

        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeModal();
        });
        modal.querySelector('#lead-details-close-btn').addEventListener('click', closeModal);
        modal.querySelector('#lead-details-edit-btn').addEventListener('click', () => {
            closeModal();
            this.openProfile(id, container);
        });

        document.body.appendChild(modal);
        dialog.focus();
    }

    /** CRM Profile modal: view/edit every Excel field plus the progress checklist. */
    async openProfile(id, container) {
        const lead = (this.allLeads || []).find(l => l.id === id);
        if (!lead) return;
        const scopeCatalog = await loadScopeCatalogNames();

        // Old leads only have `name`: prefill first/last by splitting on the first space (saved only on Save).
        let firstName = lead.firstName || '', lastName = lead.lastName || '';
        if (!firstName && !lastName && lead.name) {
            const n = String(lead.name).trim();
            const i = n.indexOf(' ');
            firstName = i > 0 ? n.slice(0, i) : n;
            lastName = i > 0 ? n.slice(i + 1).trim() : '';
        }
        const cl = checklistOf(lead);
        const val = (v) => escapeHTML(v == null ? '' : v);

        const modal = document.createElement('div');
        modal.style.position = 'fixed';
        modal.style.top = '0'; modal.style.left = '0'; modal.style.width = '100%'; modal.style.height = '100%';
        modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
        modal.style.display = 'flex'; modal.style.justifyContent = 'center'; modal.style.alignItems = 'center';
        modal.style.zIndex = '1000';

        modal.innerHTML = `
            <div style="background: white; padding: 2rem; border-radius: 8px; width: 640px; max-width: 90vw; max-height: 90vh; overflow-y: auto;">
                <div class="page-header" style="margin-bottom: 1.5rem;">
                    <h3>CRM Profile: ${escapeHTML(leadName(lead))}</h3>
                    <span style="background: #e2e8f0; padding: 0.2rem 0.5rem; border-radius: 4px; font-size: 0.85rem;">${escapeHTML(formatStatus(lead.stage))}</span>
                </div>

                <form id="crm-profile-form" class="form-stack" novalidate>
                    <h4 class="crm-section-title">Client</h4>
                    <div class="field-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem 1rem;">
                        <div class="form-group"><label>Installation No.</label><input type="text" name="clientId" value="${val(lead.clientId)}"></div>
                        <div class="form-group"><label>RN No.</label><input type="text" name="rnNo" value="${val(lead.rnNo)}"></div>
                        <div class="form-group"><label>First Name</label><input type="text" name="firstName" value="${val(firstName)}"></div>
                        <div class="form-group"><label>Last Name</label><input type="text" name="lastName" value="${val(lastName)}"></div>
                        <div class="form-group"><label>Contact Number</label><input type="text" name="phone" inputmode="tel" value="${val(lead.phone)}"></div>
                        <div class="form-group"><label>Email</label><input type="email" name="email" value="${val(lead.email)}"></div>
                        <div class="form-group">
                            <label>Mode of Communication</label>
                            <input type="text" name="modeOfCommunication" list="crm-modes" autocomplete="off" value="${val(lead.modeOfCommunication)}">
                            ${modeDatalist('crm-modes')}
                        </div>
                        <div class="form-group">
                            <label>Type of Residency</label>
                            <select name="buildingType">
                                <option value="">-- Select --</option>
                                ${residencyOptionsHtml(lead.buildingType)}
                            </select>
                        </div>
                        <div class="form-group">
                            <label>Scope of Works</label>
                            <select name="scopeOfWorks">${scopeOptionsHtml(lead.scopeOfWorks, scopeCatalog)}</select>
                        </div>
                        <div class="form-group" style="grid-column: 1 / -1;"><label>Installation Address</label><input type="text" name="installationAddress" value="${val(lead.installationAddress)}"></div>
                    </div>

                    <h4 class="crm-section-title">Progress</h4>
                    <ol class="lead-timeline lead-timeline--edit">
                        ${CHECKLIST_STAGES.map(code => {
                            const st = cl[code] || {};
                            const word = SCHEDULED_STEPS.has(code) ? 'Scheduled' : 'Done';
                            return `<li class="${st.done ? 'is-done' : ''}${code === lead.stage ? ' is-current' : ''}" data-step="${code}">
                                <label class="lead-timeline__label"><input type="checkbox" name="cl_done_${code}" ${st.done ? 'checked' : ''}> ${escapeHTML(formatStatus(code))}</label>
                                <span class="lead-timeline__word">${word}</span>
                                <input type="date" name="cl_date_${code}" value="${val(st.date)}" aria-label="${escapeHTML(formatStatus(code))} ${word.toLowerCase()} date">
                            </li>`;
                        }).join('')}
                    </ol>

                    <h4 class="crm-section-title">Notes</h4>
                    ${lead.remarks ? `<div class="lead-remarks crm-remarks-view">${linkify(lead.remarks)}</div>` : ''}
                    <div class="form-group">
                        <label>Remarks</label>
                        <textarea name="remarks" rows="3" placeholder="Add internal notes here...">${val(lead.remarks)}</textarea>
                    </div>
                    <div class="field-grid" style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem 1rem;">
                        <div class="form-group"><label>Follow-up 1</label><textarea name="followUp1" rows="2">${val(lead.followUp1)}</textarea></div>
                        <div class="form-group"><label>Follow-up 2</label><textarea name="followUp2" rows="2">${val(lead.followUp2)}</textarea></div>
                    </div>

                    <div class="modal-actions modal-actions--split" style="margin-top: 0.5rem; border-top: 1px solid #e2e8f0; padding-top: 1rem;">
                        <button type="button" id="crm-archive-btn" style="background: #ef4444; color: white;">${btnContent('archive', 'Archive Lead')}</button>
                        <div>
                            <button type="button" id="crm-close-btn" style="background: #e2e8f0; color: #333;">${btnContent('x', 'Close')}</button>
                            <button type="submit" style="background: var(--brand-green); color: white;">${btnContent('save', 'Save Changes')}</button>
                        </div>
                    </div>
                </form>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#crm-close-btn').addEventListener('click', () => {
            document.body.removeChild(modal);
        });

        modal.querySelector('#crm-archive-btn').addEventListener('click', async () => {
            if (confirm('Are you sure you want to archive this lead?')) {
                document.body.removeChild(modal);
                try {
                    const { archiveSalesLead } = await import('../../services/dataService.js');
                    await archiveSalesLead(id);
                    this.refreshLeads(container);
                } catch(err) {
                    alert('Error archiving lead: ' + err.message);
                }
            }
        });

        modal.querySelector('#crm-profile-form').addEventListener('submit', async (e2) => {
            e2.preventDefault();
            const form = e2.target;
            const formData = new FormData(form);
            const v = (k) => String(formData.get(k) || '').trim();
            const first = v('firstName'), last = v('lastName');
            const name = fullName(first, last) || lead.name || '';
            if (!name) { alert('Please enter a first or last name.'); return; }
            const email = v('email');
            if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { alert('Please enter a valid email address, or leave it empty.'); return; }
            const phone = v('phone');

            const stageChecklist = { ...cl };
            for (const code of CHECKLIST_STAGES) {
                const done = !!form.querySelector(`[name="cl_done_${code}"]`).checked;
                const date = v(`cl_date_${code}`) || null;
                if (done || date || stageChecklist[code]) stageChecklist[code] = { done, date };
            }

            const updates = {
                clientId: v('clientId'),
                rnNo: v('rnNo'),
                firstName: first,
                lastName: last,
                name,
                phone,
                email,
                contactInfo: phone || email,
                modeOfCommunication: v('modeOfCommunication'),
                buildingType: formData.get('buildingType'),
                scopeOfWorks: formData.get('scopeOfWorks'),
                installationAddress: v('installationAddress'),
                stageChecklist,
                remarks: formData.get('remarks') || '',
                followUp1: formData.get('followUp1') || '',
                followUp2: formData.get('followUp2') || ''
            };
            try {
                const { updateSalesLeadInfo } = await import('../../services/dataService.js');
                await updateSalesLeadInfo(id, updates);
                document.body.removeChild(modal);
                this.refreshLeads(container);
            } catch(err) {
                alert('Error updating CRM profile: ' + err.message);
            }
        });
    }

    async loadPipeline(container) {
        try {
            if (!this.allLeads) {
                this.allLeads = await fetchAllSalesLeads();
                this.allLeads.sort((a, b) => {
                    const at = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                    const bt = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                    if (bt !== at) return bt - at;
                    return (b.id || 0) - (a.id || 0);
                });
                this.currentPage = this.keepPage || 1;
                this.keepPage = null;
                this.pageSize = 25;
            }

            if (this.allLeads.length === 0) {
                container.innerHTML = '<p>No clients yet. Use Add Client to create one.</p>';
                return;
            }

            const q = this.searchQuery || '';
            const searchFiltered = q ? this.allLeads.filter(l => leadMatches(l, q)) : this.allLeads;

            // Keep the stage filter's option labels/counts current; counts reflect the active search.
            const stageSelect = container.parentElement && container.parentElement.querySelector('#stage-filter');
            if (stageSelect) {
                const stageCounts = {};
                searchFiltered.forEach(l => {
                    const key = l.stage || '__NONE__';
                    stageCounts[key] = (stageCounts[key] || 0) + 1;
                });
                stageSelect.innerHTML = `
                    <option value="">All stages (${searchFiltered.length})</option>
                    <option value="__NONE__">No status (${stageCounts.__NONE__ || 0})</option>
                    ${STAGES.map(s => `<option value="${s}">${escapeHTML(formatStatus(s))} (${stageCounts[s] || 0})</option>`).join('')}
                `;
                stageSelect.value = this.stageFilter || '';
            }

            const stageFilter = this.stageFilter || '';
            const filtered = stageFilter
                ? searchFiltered.filter(l => stageFilter === '__NONE__' ? !l.stage : l.stage === stageFilter)
                : searchFiltered;

            const leadsToRender = filtered.slice(0, this.currentPage * this.pageSize);
            const hasMore = leadsToRender.length < filtered.length;
            const countLine = `<p class="lead-count-line" style="margin: 0 0 0.75rem; color: #475569; font-size: 0.9rem;">Showing ${leadsToRender.length} of ${filtered.length} clients</p>`;

            if (filtered.length === 0) {
                container.innerHTML = countLine + '<p>No clients match your search and filter.</p>';
                return;
            }

            container.innerHTML = `
                ${countLine}
                <table class="leads-table" style="width: 100%; text-align: left;">
                    <thead><tr><th>Installation No.</th><th>RN No.</th><th>Name</th><th>Contact Number</th><th>Stage</th><th>Actions</th></tr></thead>
                    <tbody>
                        ${leadsToRender.map(l => `
                            <tr class="lead-row" data-id="${l.id}">
                                <td class="lead-client-id">${escapeHTML(l.clientId) || '&mdash;'}</td>
                                <td class="lead-rn-no">${escapeHTML(l.rnNo) || '&mdash;'}</td>
                                <td>${escapeHTML(leadName(l))}</td>
                                <td>${escapeHTML(l.phone || l.contactInfo || '')}</td>
                                <td>
                                    <select class="stage-select" data-id="${l.id}">
                                        ${!l.stage ? `<option value="" selected>— Set status —</option>` : ''}
                                        ${STAGES.map(s => `<option value="${s}" ${s === l.stage ? 'selected' : ''}>${escapeHTML(formatStatus(s))}</option>`).join('')}
                                    </select>
                                </td>
                                <td>
                                    <div class="table-actions">
                                    <button type="button" class="details-btn btn-sm" data-id="${l.id}" title="Show details" aria-label="Details" aria-haspopup="dialog" style="background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1;">${btnContent('eye', 'Details')}</button>
                                    <button class="profile-btn btn-sm" data-id="${l.id}" title="View CRM Profile" aria-label="Profile" style="background-color: #6366f1; color: white;">${btnContent('user', 'Profile')}</button>
                                    ${l.ocularId ? `<button class="view-reports-btn btn-sm" data-id="${l.id}" title="View Project Reports" aria-label="Reports" style="background-color: #f59e0b; color: white;">${btnContent('clipboard-list', 'Reports')}</button>` : ''}
                                    ${!l.ocularId ? `<button class="dispatch-btn btn-sm" data-id="${l.id}" title="Dispatch Inspection" aria-label="Dispatch" style="background-color: var(--brand-green); color: white;">${btnContent('truck', 'Dispatch')}</button>` : ''}
                                    ${l.stage === 'SITE_VISIT_COMPLETED' ? `<button class="quote-btn btn-sm" data-id="${l.id}" title="Generate Quote" aria-label="Quote" style="background-color: #8b5cf6; color: white;">${btnContent('file-text', 'Quote')}</button>` : ''}
                                    ${l.ocularId && !l.installationId ? `<button class="dispatch-install-btn btn-sm" data-id="${l.id}" title="Dispatch Install" aria-label="Install">${btnContent('wrench', 'Install')}</button>` : ''}
                                    </div>
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
                ${hasMore ? `<div style="text-align: center; margin-top: 1rem;"><button id="load-more-btn" style="padding: 0.5rem 2rem; background: #f1f5f9; color: #334155; border: 1px solid #cbd5e1;">${btnContent('chevrons-down', 'Load More')}</button></div>` : ''}
            </div>

            <!-- View Reports Modal -->
            <div id="reports-modal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center;">
                <div class="print-modal-content" style="background: white; padding: 2rem; border-radius: 8px; width: 900px; max-width: 95vw; max-height: 90vh; overflow-y: auto; position: relative;">
                    <div class="print-hide toolbar" style="position: absolute; top: 1rem; right: 1rem; gap: 0.5rem;">
                        <button type="button" id="print-reports-btn" style="background: var(--brand-green); color: white;">${btnContent('printer', 'Print / PDF')}</button>
                        <button type="button" id="close-reports-btn" style="background: #e2e8f0;">${btnContent('x', 'Close')}</button>
                    </div>
                    <h2 style="margin-top: 0;">Project Reports</h2>
                    <div style="display: flex; gap: 2rem; margin-top: 1rem;">
                        <div id="reports-ocular-content" style="flex: 1; border: 1px solid #e2e8f0; padding: 1rem; border-radius: 8px; background: #f8fafc;"></div>
                        <div id="reports-install-content" style="flex: 1; border: 1px solid #e2e8f0; padding: 1rem; border-radius: 8px; background: #f8fafc;"></div>
                    </div>
                </div>
            </div>

        `;

            const loadMoreBtn = container.querySelector('#load-more-btn');
            if (loadMoreBtn) {
                loadMoreBtn.addEventListener('click', () => {
                    this.currentPage++;
                    this.loadPipeline(container);
                });
            }

            container.querySelectorAll('.stage-select').forEach(sel => {
                sel.addEventListener('change', async (e) => {
                    const id = parseInt(e.target.dataset.id, 10);
                    const newStage = e.target.value;
                    if (!newStage) return; // placeholder re-selected: no-op, don't save
                    try {
                        await updateSalesLeadStage(id, newStage);
                        this.refreshLeads(container);
                    } catch(err) {
                        alert('Error updating stage: ' + err.message);
                    }
                });
            });

            // Details: read-only popup dialog (no re-fetch; edit continues into the CRM Profile modal).
            container.querySelectorAll('.details-btn').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const b = e.currentTarget;
                    const id = parseInt(b.dataset.id, 10);
                    this.openDetailsModal(id, container, b);
                });
            });

            container.querySelectorAll('.view-reports-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = parseInt(e.target.dataset.id, 10);
                    const lead = this.allLeads.find(l => l.id === id);
                    if (!lead) return;

                    const reportsModal = container.querySelector('#reports-modal');
                    const ocularContainer = container.querySelector('#reports-ocular-content');
                    const installContainer = container.querySelector('#reports-install-content');

                    const { get, COLLECTIONS } = await import('../../services/localDb.js');
                    const { buildInspectionSummaryHtml } = await import('../../shared/inspectionSummary.js');
                    const { buildInstallationSummaryHtml } = await import('../../shared/installationSummary.js');

                    ocularContainer.innerHTML = '<p>Loading...</p>';
                    installContainer.innerHTML = '<p>Loading...</p>';
                    reportsModal.style.display = 'flex';

                    let ocular = null;
                    if (lead.ocularId) {
                        let ocularId = lead.ocularId;
                        if (typeof ocularId === 'object' && ocularId !== null) ocularId = ocularId.id;
                        ocular = await get(COLLECTIONS.OCULAR_INSPECTIONS, ocularId);
                    }
                    ocularContainer.innerHTML = ocular ? buildInspectionSummaryHtml(ocular) : '<p>No inspection report available.</p>';

                    let install = null;
                    if (lead.installationId) {
                        let installId = lead.installationId;
                        if (typeof installId === 'object' && installId !== null) installId = installId.id;
                        install = await get(COLLECTIONS.INSTALLATION_RECORDS, installId);
                    }
                    installContainer.innerHTML = install ? buildInstallationSummaryHtml(install) : '<p>No installation report available.</p>';
                });
            });

            const closeReportsBtn = container.querySelector('#close-reports-btn');
            if (closeReportsBtn) {
                closeReportsBtn.addEventListener('click', () => {
                    container.querySelector('#reports-modal').style.display = 'none';
                });
            }

            const printReportsBtn = container.querySelector('#print-reports-btn');
            if (printReportsBtn) {
                printReportsBtn.addEventListener('click', () => {
                    window.print();
                });
            }

            container.querySelectorAll('.quote-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = parseInt(e.target.dataset.id, 10);
                    const lead = this.allLeads.find(l => l.id === id);
                    if (!lead) return;

                    const { get, COLLECTIONS } = await import('../../services/localDb.js');
                    const { getCatalog } = await import('../../services/masterDataService.js');
                    
                    let ocularId = lead.ocularId;
                    if (typeof ocularId === 'object' && ocularId !== null) ocularId = ocularId.id;
                    const ocular = ocularId ? await get(COLLECTIONS.OCULAR_INSPECTIONS, ocularId) : null;
                    const catalog = await getCatalog();

                    // Generate BOM from ocular
                    const bom = [];
                    if (ocular) {
                        // Example mapping of form fields to catalog
                        const mapping = {
                            conduitPvc: { key: 'cond-pvc20', name: '20mm PVC Conduit' },
                            conduitEmt: { key: 'cond-emt', name: 'EMT Conduit' },
                            boxUtility: { key: 'box-util', name: 'Utility Box' },
                            breakerMain: { key: 'b-100a', name: 'Main Breaker (100A)' },
                            chargerType: { key: 'c-7kw', name: 'AC Charger (7kW)' } // Just an example
                        };

                        for (const [formKey, mapData] of Object.entries(mapping)) {
                            const qty = parseInt(ocular[formKey], 10);
                            if (qty && qty > 0) {
                                const cItem = catalog.find(c => c.itemKey === mapData.key);
                                bom.push({
                                    name: cItem ? cItem.itemName : mapData.name,
                                    qty: qty,
                                    unitPrice: cItem ? (cItem.unitPrice || 0) : 0
                                });
                            }
                        }
                        
                        // Add some dummy items if BOM is empty for demo purposes
                        if (bom.length === 0) {
                            bom.push({ name: 'Generic Wiring Pack', qty: 1, unitPrice: 2500 });
                            bom.push({ name: 'Standard Breaker Box', qty: 1, unitPrice: 3500 });
                        }
                    }

                    const modal = document.createElement('div');
                    modal.className = 'print-hide';
                    modal.style.position = 'fixed';
                    modal.style.top = '0'; modal.style.left = '0'; modal.style.width = '100%'; modal.style.height = '100%';
                    modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
                    modal.style.display = 'flex'; modal.style.justifyContent = 'center'; modal.style.alignItems = 'center';
                    modal.style.zIndex = '1000';
                    
                    modal.innerHTML = `
                        <div style="background: white; padding: 2rem; border-radius: 8px; width: 500px; max-height: 90vh; overflow-y: auto;">
                            <h3 style="margin-top:0;">Generate Quote: ${escapeHTML(lead.name)}</h3>
                            
                            <h4>Bill of Materials</h4>
                            <table style="width:100%; border-collapse: collapse; margin-bottom: 1rem; font-size: 0.9rem;">
                                <thead>
                                    <tr style="border-bottom: 2px solid #ccc; text-align: left;">
                                        <th>Item</th><th>Qty</th><th>Unit (₱)</th><th>Total</th>
                                    </tr>
                                </thead>
                                <tbody id="bom-tbody">
                                    ${bom.map((item, idx) => `
                                        <tr style="border-bottom: 1px solid #eee;">
                                            <td>${escapeHTML(item.name)}</td>
                                            <td>${item.qty}</td>
                                            <td><input type="number" class="bom-price" data-idx="${idx}" value="${item.unitPrice}" style="width: 80px; padding: 0.2rem;"></td>
                                            <td class="bom-line-total">₱${(item.qty * item.unitPrice).toLocaleString()}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>

                            <div class="form-group" style="margin-top: 1rem;">
                                <label>Miscellaneous / Buffer (₱)</label>
                                <input type="number" id="quote-misc" value="0">
                            </div>
                            <div class="form-group">
                                <label>Labor & Services (₱)</label>
                                <input type="number" id="quote-labor" value="5000">
                            </div>
                            <div class="form-group">
                                <label>Total Quote Amount (₱)</label>
                                <input type="number" id="quote-total" readonly style="background: #f3f4f6; font-weight: bold; font-size: 1.2rem; color: #059669;">
                            </div>
                            
                            <div class="modal-actions">
                                <button id="quote-cancel" style="background: #e2e8f0; color: #333;">${btnContent('x', 'Cancel')}</button>
                                <button id="quote-confirm" style="background: #8b5cf6; color: white;">${btnContent('file-text', 'Save & Send Quote')}</button>
                            </div>
                        </div>
                    `;
                    document.body.appendChild(modal);

                    const miscInput = modal.querySelector('#quote-misc');
                    const laborInput = modal.querySelector('#quote-labor');
                    const totalInput = modal.querySelector('#quote-total');
                    const priceInputs = modal.querySelectorAll('.bom-price');
                    const totalCells = modal.querySelectorAll('.bom-line-total');

                    const recalcTotal = () => {
                        let matTotal = 0;
                        priceInputs.forEach((input, idx) => {
                            const p = parseFloat(input.value) || 0;
                            const qty = bom[idx].qty;
                            const lineTotal = p * qty;
                            totalCells[idx].textContent = '₱' + lineTotal.toLocaleString();
                            matTotal += lineTotal;
                        });

                        const misc = parseFloat(miscInput.value) || 0;
                        const labor = parseFloat(laborInput.value) || 0;
                        const grandTotal = matTotal + misc + labor;
                        totalInput.value = grandTotal;
                    };

                    priceInputs.forEach(inp => inp.addEventListener('input', recalcTotal));
                    miscInput.addEventListener('input', recalcTotal);
                    laborInput.addEventListener('input', recalcTotal);
                    
                    // initial calc
                    recalcTotal();

                    modal.querySelector('#quote-cancel').addEventListener('click', () => {
                        document.body.removeChild(modal);
                    });

                    modal.querySelector('#quote-confirm').addEventListener('click', async () => {
                        try {
                            const { updateSalesLeadStage } = await import('../../services/dataService.js');
                            // In a real app we'd save the quote object here
                            await updateSalesLeadStage(id, 'QUOTE_SENT');
                            document.body.removeChild(modal);
                            this.refreshLeads(container);
                        } catch(err) {
                            alert('Error sending quote: ' + err.message);
                        }
                    });
                });
            });

            container.querySelectorAll('.profile-btn').forEach(btn => {
                btn.addEventListener('click', (e) => this.openProfile(parseInt(e.currentTarget.dataset.id, 10), container));
            });

            container.querySelectorAll('.dispatch-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = parseInt(e.target.dataset.id, 10);
                    const lead = (this.allLeads || []).find(l => l.id === id);
                    const crewSelectHtml = await buildCrewSelectHtml('dispatch-assignee');

                    const modal = document.createElement('div');
                    modal.style.position = 'fixed';
                    modal.style.top = '0'; modal.style.left = '0'; modal.style.width = '100%'; modal.style.height = '100%';
                    modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
                    modal.style.display = 'flex'; modal.style.justifyContent = 'center'; modal.style.alignItems = 'center';
                    modal.style.zIndex = '1000';
                    
                    modal.innerHTML = `
                        <div style="background: white; padding: 2rem; border-radius: 8px; width: 400px;">
                            <h3>Schedule & Dispatch Inspection</h3>
                            <div class="form-group">
                                <label>RN Number</label>
                                <input type="text" id="dispatch-rn" value="${escapeHTML(lead && lead.rnNo ? lead.rnNo : '')}">
                            </div>
                            <div class="form-group">
                                <label>Assign Crew Member</label>
                                ${crewSelectHtml}
                            </div>
                            <div class="form-group">
                                <label>Scheduled Date & Time</label>
                                <input type="datetime-local" id="dispatch-date" required>
                            </div>
                            <div class="modal-actions">
                                <button id="dispatch-cancel" style="background: #e2e8f0; color: #333;">${btnContent('x', 'Cancel')}</button>
                                <button id="dispatch-confirm" style="background: var(--brand-green); color: white;">${btnContent('truck', 'Dispatch')}</button>
                            </div>
                        </div>
                    `;
                    document.body.appendChild(modal);
                    
                    modal.querySelector('#dispatch-cancel').addEventListener('click', () => {
                        document.body.removeChild(modal);
                    });
                    
                    modal.querySelector('#dispatch-confirm').addEventListener('click', async () => {
                        const rnNo = modal.querySelector('#dispatch-rn').value;
                        const teamId = parseInt(modal.querySelector('#dispatch-assignee').value, 10);
                        if (modal.querySelector('#dispatch-assignee').disabled) { alert('No active Operations users to dispatch to.'); return; }
                        const scheduledDate = modal.querySelector('#dispatch-date').value;
                        
                        if (!rnNo || !teamId || !scheduledDate) {
                            alert('Please fill out all fields.');
                            return;
                        }
                        
                        document.body.removeChild(modal);
                        try {
                            await dispatchOcularFromLead(id, teamId, rnNo, scheduledDate);
                            alert('Inspection successfully scheduled and dispatched!');
                            this.refreshLeads(container);
                        } catch(err) {
                            alert('Error dispatching: ' + err.message);
                        }
                    });
                });
            });

            container.querySelectorAll('.dispatch-install-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = parseInt(e.target.dataset.id, 10);
                    const lead = (this.allLeads || []).find(l => l.id === id);
                    const crewSelectHtml = await buildCrewSelectHtml('dispatch-install-assignee');

                    const modal = document.createElement('div');
                    modal.style.position = 'fixed';
                    modal.style.top = '0'; modal.style.left = '0'; modal.style.width = '100%'; modal.style.height = '100%';
                    modal.style.backgroundColor = 'rgba(0,0,0,0.5)';
                    modal.style.display = 'flex'; modal.style.justifyContent = 'center'; modal.style.alignItems = 'center';
                    modal.style.zIndex = '1000';
                    
                    modal.innerHTML = `
                        <div style="background: white; padding: 2rem; border-radius: 8px; width: 400px;">
                            <h3>Schedule & Dispatch Installation</h3>
                            <div class="form-group">
                                <label>Installation Number</label>
                                <input type="text" id="dispatch-install-no" value="${escapeHTML(lead && lead.clientId ? lead.clientId : '')}">
                            </div>
                            <div class="form-group">
                                <label>Assign Crew Member</label>
                                ${crewSelectHtml}
                            </div>
                            <div class="form-group">
                                <label>Scheduled Date & Time</label>
                                <input type="datetime-local" id="dispatch-install-date" required>
                            </div>
                            <div class="modal-actions">
                                <button id="dispatch-install-cancel" style="background: #e2e8f0; color: #333;">${btnContent('x', 'Cancel')}</button>
                                <button id="dispatch-install-confirm">${btnContent('wrench', 'Dispatch')}</button>
                            </div>
                        </div>
                    `;
                    document.body.appendChild(modal);
                    
                    modal.querySelector('#dispatch-install-cancel').addEventListener('click', () => {
                        document.body.removeChild(modal);
                    });
                    
                    modal.querySelector('#dispatch-install-confirm').addEventListener('click', async () => {
                        const instNo = modal.querySelector('#dispatch-install-no').value;
                        const teamId = parseInt(modal.querySelector('#dispatch-install-assignee').value, 10);
                        if (modal.querySelector('#dispatch-install-assignee').disabled) { alert('No active Operations users to dispatch to.'); return; }
                        const scheduledDate = modal.querySelector('#dispatch-install-date').value;
                        
                        if (!instNo || !teamId || !scheduledDate) {
                            alert('Please fill out all fields.');
                            return;
                        }
                        
                        document.body.removeChild(modal);
                        try {
                            const { dispatchInstallationFromLead } = await import('../../services/dataService.js');
                            await dispatchInstallationFromLead(id, teamId, instNo, scheduledDate);
                            alert('Installation successfully scheduled and dispatched!');
                            this.refreshLeads(container);
                        } catch(err) {
                            alert('Error dispatching: ' + err.message);
                        }
                    });
                });
            });

            container.querySelectorAll('.archive-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    const id = parseInt(e.target.dataset.id, 10);
                    if (confirm('Archive this lead?')) {
                        try {
                            await archiveSalesLead(id);
                            this.refreshLeads(container);
                        } catch(err) {
                            alert('Error archiving lead: ' + err.message);
                        }
                    }
                });
            });
        } catch (e) {
            container.innerHTML = `<p style="color:red;">Failed to load pipeline: ${e.message}</p>`;
        }
    }
}

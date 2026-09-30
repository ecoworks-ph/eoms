// Pure display helpers for Admin -> Audit Logs (no DOM / network, so they can be tested in isolation).
import { formatStatus } from '../../shared/statusFormatter.js';

const TZ = 'Asia/Manila';

export const titleCase = (s) => String(s || '')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_.]+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, c => c.toUpperCase());

const EVENT_LABELS = {
    UPDATE_STAGE: 'Stage changed',
    UPDATE_INFO: 'Details edited',
    CREATE_LEAD: 'Client added',
    APPROVE: 'Inspection approved',
    REJECT: 'Inspection rejected',
    UPDATE_STATUS: 'Status changed',
    UPDATE_USER: 'User updated',
    CREATE_USER: 'User added',
    REMOVE_USER: 'User removed',
    RESTORE_USER: 'User restored',
    UPDATE_ITEM: 'Item updated',
    LOGIN: 'Signed in',
    LOGOUT: 'Signed out',
    EXPORT: 'Data exported'
};
export const eventLabel = (code) => EVENT_LABELS[code] || titleCase(code) || '—';

const ROLE_PILLS = {
    admin: ['Admin/Owner', 'audit-role--admin'],
    customer_care_manager: ['Customer Care', 'audit-role--cc'],
    lead_engineer: ['Engineering', 'audit-role--eng'],
    operations: ['Operations', 'audit-role--ops']
};
export const roleName = (role) => (ROLE_PILLS[role] ? ROLE_PILLS[role][0] : (titleCase(role) || '—'));
export const roleClass = (role) => (ROLE_PILLS[role] ? ROLE_PILLS[role][1] : 'audit-role--other');

const TYPE_LABELS = { LEAD: 'Client', OCULAR: 'Inspection', INSPECTION: 'Inspection', INSTALLATION: 'Installation', USER: 'User', ITEM: 'Item', TICKET: 'Ticket' };
export function recordLabel(log) {
    if (log.resourceLabel) return log.resourceLabel;
    if (!log.resourceType && (log.resourceId === undefined || log.resourceId === null)) return '—';
    const type = TYPE_LABELS[log.resourceType] || titleCase(log.resourceType) || 'Record';
    return (log.resourceId === undefined || log.resourceId === null || log.resourceId === '') ? type : `${type} #${log.resourceId}`;
}

/** Split "Client · Name (ID)" into { main: "Client · Name", sub: "ID" } for the two-line Record cell. */
export function splitRecord(label) {
    const m = /^(.*) \(([^()]*)\)$/.exec(String(label || ''));
    return m ? { main: m[1], sub: m[2] } : { main: String(label || ''), sub: '' };
}

/** Actor display name: stored actorName, else the profile's full name, else the email. */
export function actorName(log, profilesById = new Map()) {
    if (log.actorName) return log.actorName;
    const p = log.actorId !== undefined && log.actorId !== null ? profilesById.get(String(log.actorId)) : null;
    return (p && (p.fullName || p.email)) || log.actorEmail || 'System';
}

export function formatTimestamp(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return d.toLocaleString('en-US', { timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' });
}

/** Manila calendar day (YYYY-MM-DD) for the From/To filters. */
export function manilaDay(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

const FIELD_LABELS = {
    clientId: 'Installation No.', rnNo: 'RN No.', firstName: 'First Name', lastName: 'Last Name', name: 'Client Name',
    phone: 'Contact Number', email: 'Email', contactInfo: 'Contact Info', modeOfCommunication: 'Mode of Communication',
    buildingType: 'Type of Residency', scopeOfWorks: 'Scope of Works', installationAddress: 'Installation Address',
    remarks: 'Remarks', followUp1: 'Follow-up 1', followUp2: 'Follow-up 2', stage: 'Stage', status: 'Status',
    qaNotes: 'Review Notes', fullName: 'Name', role: 'Role', department: 'Department', itemName: 'Item Name',
    category: 'Category', currentStock: 'Current Stock', unitPrice: 'Unit Price', scheduledDate: 'Scheduled Date',
    assignedTeam: 'Assigned Crew', deletedAt: 'Removed On'
};
export function fieldLabel(key) {
    if (FIELD_LABELS[key]) return FIELD_LABELS[key];
    if (key.startsWith('stageChecklist.')) return formatStatus(key.slice('stageChecklist.'.length));
    return titleCase(key);
}

function formatDay(ymd) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
}

export function formatValue(key, v) {
    if (v === undefined || v === null || v === '') return '(blank)';
    if (key === 'stage' || key === 'status') return formatStatus(v);
    if (key === 'role') return roleName(v);
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (typeof v === 'object') return JSON.stringify(v);
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return formatDay(s);
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s)) return formatTimestamp(s) || s;
    return s;
}

const hasDelta = (log) => !!(log.changesDelta && typeof log.changesDelta === 'object' && Object.keys(log.changesDelta).length);

/** Rows for the Changes dialog/CSV plus review notes pulled out of the table. */
export function changeRows(log) {
    if (!hasDelta(log)) return { rows: [], notes: '' };
    const rows = [];
    let notes = '';
    for (const [key, d] of Object.entries(log.changesDelta)) {
        const from = d && typeof d === 'object' ? d.from : undefined;
        const to = d && typeof d === 'object' ? d.to : d;
        if (key === 'qaNotes') { notes = to ? String(to) : ''; if (notes) continue; }
        rows.push({ field: fieldLabel(key), before: formatValue(key, from), after: formatValue(key, to) });
    }
    return { rows, notes };
}
export const hasChanges = (log) => { const c = changeRows(log); return c.rows.length > 0 || !!c.notes; };

export function changesSummary(log) {
    const { rows, notes } = changeRows(log);
    const parts = rows.map(r => `${r.field}: ${r.before} → ${r.after}`);
    if (notes) parts.push(`Review notes: ${notes}`);
    return parts.join('; ');
}

/** Normalise raw logs into display entries (newest first). */
export function toEntries(logs, profilesById) {
    return logs
        .map(l => {
            const entry = {
                log: l,
                actor: actorName(l, profilesById),
                email: l.actorEmail || '',
                role: roleName(l.actorRole),
                roleClass: roleClass(l.actorRole),
                event: eventLabel(l.eventType),
                record: recordLabel(l),
                when: formatTimestamp(l.createdAt),
                day: manilaDay(l.createdAt),
                changes: hasChanges(l)
            };
            entry.haystack = [entry.actor, entry.email, entry.event, entry.record, l.description].join(' ').toLowerCase();
            return entry;
        })
        .sort((a, b) => new Date(b.log.createdAt) - new Date(a.log.createdAt));
}

export function filterEntries(entries, { q = '', role = '', event = '', from = '', to = '' } = {}) {
    const needle = q.trim().toLowerCase();
    return entries.filter(e => {
        if (role && e.role !== role) return false;
        if (event && e.event !== event) return false;
        if (from && e.day < from) return false;
        if (to && e.day > to) return false;
        return !needle || e.haystack.includes(needle);
    });
}

/** CSV cell guard against spreadsheet formula injection. */
const safeCell = (v) => { const s = String(v ?? ''); return /^[=+@\t\r]|^-[^\d]/.test(s) ? `'${s}` : s; };
export function entriesToCSV(entries) {
    const rows = [['Timestamp (ISO)', 'Actor', 'Actor Email', 'Role', 'Event', 'Record', 'Changes']]
        .concat(entries.map(e => [e.log.createdAt, e.actor, e.email, e.role, e.event, e.record, changesSummary(e.log)]));
    return rows.map(r => r.map(v => {
        const s = safeCell(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(',')).join('\r\n');
}

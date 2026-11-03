// Pure helpers for the Add Client "existing client" check (no DOM, no network).

const MIN_PHONE_DIGITS = 7;

/** Digits only, with a leading Philippine country code (63) or trunk 0 removed: "0917 317 7569" and "+63 917 317 7569" both give "9173177569". */
export function normalisePhone(value) {
  let d = String(value == null ? '' : value).replace(/\D/g, '');
  if (d.startsWith('63')) d = d.slice(2);
  else if (d.startsWith('0')) d = d.slice(1);
  return d;
}

const normaliseText = (v) => String(v == null ? '' : v).trim().toLowerCase();

/**
 * Leads (archived included) that share the phone, email or client ID typed in the form.
 * Returns [{ lead, why }] where why is a subset of ['clientId', 'phone', 'email']. Blank inputs never match; names are not compared.
 */
export function findExistingClients({ phone, email, clientId }, leads) {
  const p = normalisePhone(phone);
  const e = normaliseText(email);
  const c = normaliseText(clientId);
  const matches = [];
  for (const lead of leads || []) {
    const why = [];
    if (c && normaliseText(lead.clientId) === c) why.push('clientId');
    if (p.length >= MIN_PHONE_DIGITS) {
      const lp = normalisePhone(lead.phone);
      const lc = String(lead.contactInfo || '').includes('@') ? '' : normalisePhone(lead.contactInfo); // contactInfo falls back to the email
      if (lp === p || lc === p) why.push('phone');
    }
    if (e && normaliseText(lead.email) === e) why.push('email');
    if (why.length) matches.push({ lead, why });
  }
  return matches;
}

// Keep account identity matching separate from the exact values accepted in a CSV.
const nameKey = (value) => String(value || '').trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const emailKey = (value) => String(value || '').trim().toLowerCase();

export function buildOwnerIndex(owners, { users = [], user = null, invitations = [] } = {}) {
  const names = owners.filter((name) => name !== 'Sin asignar');
  const records = new Map();
  const candidates = (name) => {
    const exact = names.filter((owner) => nameKey(owner) === nameKey(name));
    if (exact.length) return exact;
    const parts = nameKey(name).split(/[\s._-]+/).filter(Boolean);
    if (parts.length < 2) return [];
    // Full account names map to the abbreviated labels used by CRM records.
    return names.filter((owner) => nameKey(owner) === `${parts[0]} ${parts[1][0]}.`);
  };
  const add = (person, inferFromEmail = false) => {
    if (!person || typeof person !== 'object') return;
    const email = emailKey(person.email);
    if (!email) return;
    const label = person.name || person.full_name || '';
    // Settings uses the email as a placeholder name for invitation-only users.
    const name = emailKey(label) === email ? '' : label;
    // A known directory identity wins over guessing a name from the email.
    if (!name && [...records.values()].some((record) => record.email === email)) return;
    const matches = candidates(name || (inferFromEmail ? email.split('@')[0] : ''));
    for (const owner of matches) {
      const key = `${email}\n${owner}`;
      if (!records.has(key)) records.set(key, { email, name: owner, aliases: new Set([nameKey(owner)]) });
      if (name) records.get(key).aliases.add(nameKey(name));
    }
  };
  (Array.isArray(users) ? users : []).forEach((person) => add(person));
  if (user) add({ email: user.email, name: user.user_metadata?.name || user.user_metadata?.full_name }, true);
  // Saved invitation-only directory rows may outlive an unavailable invitation
  // fetch. Infer their label only after explicit directory/session identities.
  (Array.isArray(users) ? users : []).forEach((person) => add(person, true));
  (Array.isArray(invitations) ? invitations : []).forEach((person) => {
    if (!person || typeof person !== 'object') return;
    // An invitation repeats an existing identity; it must not create ambiguity.
    if (![...records.values()].some((record) => record.email === emailKey(person.email))) add(person, true);
  });
  names.forEach((name) => {
    if (![...records.values()].some((record) => record.name === name)) {
      records.set(`name:${name}`, { name, email: '', aliases: new Set([nameKey(name)]) });
    }
  });
  return [...records.values()];
}

export function resolveIndexedOwner(index, raw) {
  if (!String(raw ?? '').trim()) return { value: '' };
  const hits = String(raw).includes('@')
    ? index.filter((owner) => owner.email === emailKey(raw))
    : index.filter((owner) => owner.aliases.has(nameKey(raw)));
  if (hits.length === 1) return { value: hits[0].name };
  return { value: '', error: hits.length > 1 ? 'MULTIPLE_OWNERS_FOUND' : 'OWNER_NOT_FOUND' };
}

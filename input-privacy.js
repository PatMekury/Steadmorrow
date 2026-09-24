// Local, deterministic screening. No text is sent to a model to classify it.
// This catches common signals, not every person's name or sensitive narrative.
export const privacyMessage = 'Use property goals only. Remove personal names, contact details and private donor, membership, counseling or child records.';
export const addressPrivacyMessage = 'Enter a property address or place name only. Remove personal contact details and private records.';

const canonical = value => String(value ?? '').normalize('NFKC').replace(/[\u200B-\u200D\u2060\uFEFF]/g, '').replace(/[\u2010-\u2015]/g, '-');
const restricted = [
  /[\w.+-]+\s*@\s*[\w-]+(?:\s*\.\s*[\w-]+)+/i,
  /\b[\w.+-]+\s*\[at\]\s*[\w-]+\s*\[dot\]\s*\w+\b/i,
  /(?:\+?1[ .-]*)?\(\d{3}\)[ .-]*\d{3}[ .-]*\d{4}\b|\b\d{3}[ .-]\d{3}[ .-]\d{4}\b/,
  /\b\d{3}[- ]\d{2}[- ]\d{4}\b/,
  /\b(?:phone|mobile|call|text me|contact)\s*[:=]?\s*\+?\d[\d ()-]{6,}/i,
  /\b(?:ssn|social security|date of birth|dob|credit card|bank account|routing number)\b/i,
  /\b(?:donor|donation|tithing|membership|congregational|congregant|counseling|counselling|medical|student|minor|child|children)\s+(?:list|roster|record|records|database|details|data|notes|file|files)\b/i,
  /\b(?:member|volunteer)\s+(?:list|roster|records|database|files)\b/i,
  /\b(?:prayer requests?|session notes?|case notes?|patient records?|diagnosed with)\b/i,
  /\b(?:full name|first name|last name|donor|counselee|patient|child|student|member)\s*:/i,
  /\b(?:my name is|my (?:son|daughter|child)|(?:age|aged)\s*:?\s*\d{1,2}\b)/i,
  /\b(?:donor|member|child|minor|counselee|patient|student)\s+(?:named\s+)?[A-Z][a-z]+\s+[A-Z][a-z]+\b/,
  /\b(?:donated|gave|pledged|tithes?|tithing)\s+(?:us\s+)?\$\s*\d/i,
];

export function hasPrivateInput(value, { address = false } = {}) {
  const text = canonical(value);
  return restricted.some(pattern => pattern.test(text)) ||
    (!address && /\b(?:\+?1)?\d{10}\b/.test(text));
}

export function privateInputFields({ query = '', priorities = {} } = {}) {
  const fields = [];
  if (hasPrivateInput(query, { address: true })) fields.push('query');
  const purpose = priorities.purpose ?? '', matters = priorities.matters ?? priorities.preserve ?? '';
  if (hasPrivateInput(purpose)) fields.push('purpose');
  if (hasPrivateInput(matters)) fields.push('matters');
  if (!fields.includes('purpose') && !fields.includes('matters') && hasPrivateInput(`${purpose}\n${matters}`)) fields.push('purpose', 'matters');
  return fields;
}

// Reused for writes and migration of existing browser saves. Never return the
// rejected text in an error or copy unrelated/unknown stored properties.
export function screenedLandSave({ points, mode, confirmed, query = '', priorities = {} }) {
  const retired = Array.isArray(priorities.choices) ? priorities.choices.filter(c => ['Keep open space', 'Limit the initial commitment'].includes(c)) : [];
  const retained = {...priorities, preserve: [priorities.preserve ?? priorities.matters ?? '', ...retired].filter(Boolean).join(' · ')};
  const fields = privateInputFields({ query, priorities: retained });
  return { version: 1, points, mode, confirmed, query: fields.includes('query') ? '' : query,
    priorities: {
      purpose: fields.includes('purpose') ? '' : priorities.purpose ?? '',
      preserve: fields.includes('matters') ? '' : retained.preserve,
      exploring: priorities.exploring === true,
      choices: ['Retain ownership', 'Understand local housing needs'].filter(c => priorities.choices?.includes(c)),
      saved: fields.length ? false : priorities.saved === true,
    },
  };
}

export function isPrivateRecordField(field) {
  const label = canonical(typeof field === 'string' ? field : `${field.name} ${field.alias ?? ''}`).replace(/[^a-z0-9]/gi, '');
  return /owner|^own\d|ownname|mail|phone|email|contact|firstname|lastname|fullname|donor|counsel|patient|birth|^dob$|socialsecurity|ssn|beneficiar|membername|childname/i.test(label);
}

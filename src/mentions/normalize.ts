import { createHash } from 'crypto';

const SOURCE_ALIASES: Record<string, string> = {
  thestar: 'The Star',
  'the star': 'The Star',
  malaysiakini: 'Malaysiakini',
  'new straits times': 'New Straits Times',
  nst: 'New Straits Times',
  twitter: 'Twitter',
  facebook: 'Facebook',
  instagram: 'Instagram',
};

// Normalisasi nama source ke nama kanonik.
export function normalizeSource(raw: string | null | undefined): string {
  const cleaned = (raw ?? '').trim().replace(/\s+/g, ' ');
  if (!cleaned) return 'Unknown';

  const key = cleaned.toLowerCase();
  if (SOURCE_ALIASES[key]) return SOURCE_ALIASES[key];

  return cleaned
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// Menghapus tag HTML dan isi script/style.
export function stripHtml(raw: string | null | undefined): string {
  if (!raw) return '';

  return raw
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Parse berbagai format tanggal menjadi Date.
export function parsePublishedAt(raw: unknown): Date | null {
  if (raw === null || raw === undefined || raw === '') return null;

  if (typeof raw === 'number') {
    const ms = raw < 1e12 ? raw * 1000 : raw;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? null : d;
  }

  if (typeof raw !== 'string') return null;

  const value = raw.trim();

  const dmy = value.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (dmy) {
    const [, dd, mm, yyyy] = dmy;
    const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
    return isNaN(d.getTime()) ? null : d;
  }

  // Format tanpa timezone dianggap UTC.
  const noTz = value.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/);

  if (noTz) {
    const d = new Date(`${noTz[1]}T${noTz[2]}Z`);
    return isNaN(d.getTime()) ? null : d;
  }

  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
}

// Parse engagement dari number atau string seperti "3,402".
export function parseEngagement(raw: unknown): number {
  if (typeof raw === 'number') {
    return Number.isFinite(raw) ? Math.trunc(raw) : 0;
  }

  if (typeof raw === 'string') {
    const stripped = raw.replace(/,/g, '').trim();
    const n = Number(stripped);

    return Number.isFinite(n) ? Math.trunc(n) : 0;
  }

  return 0;
}

function normalizeForHash(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Membuat hash dari title dan content yang sudah dinormalisasi.
export function hashContent(
  title: string | null | undefined,
  contentClean: string,
): string {
  const normalizedTitle = normalizeForHash(title ?? '');
  const normalizedContent = normalizeForHash(contentClean);

  return createHash('sha256')
    .update(`${normalizedTitle}|${normalizedContent}`)
    .digest('hex');
}

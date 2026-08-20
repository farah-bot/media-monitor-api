import {
  normalizeSource,
  stripHtml,
  parsePublishedAt,
  parseEngagement,
  hashContent,
} from './normalize';

describe('normalizeSource', () => {
  it('maps known aliases to a single canonical name', () => {
    expect(normalizeSource('The Star')).toBe('The Star');
    expect(normalizeSource('thestar')).toBe('The Star');
    expect(normalizeSource('malaysiakini ')).toBe('Malaysiakini');
    expect(normalizeSource('Malaysiakini')).toBe('Malaysiakini');
    expect(normalizeSource('TWITTER')).toBe('Twitter');
    expect(normalizeSource('twitter')).toBe('Twitter');
  });

  it('title-cases unknown sources instead of dropping them', () => {
    expect(normalizeSource('some new outlet')).toBe('Some New Outlet');
  });

  it('falls back to "Unknown" for empty/null input', () => {
    expect(normalizeSource(null)).toBe('Unknown');
    expect(normalizeSource('')).toBe('Unknown');
    expect(normalizeSource('   ')).toBe('Unknown');
  });
});

describe('stripHtml', () => {
  it('removes tags and script content', () => {
    expect(stripHtml('<p>Hello <b>World</b></p>')).toBe('Hello World');
    expect(stripHtml('<p>ok</p><script>alert(1)</script>')).toBe('ok');
  });

  it('handles null/empty input', () => {
    expect(stripHtml(null)).toBe('');
    expect(stripHtml('')).toBe('');
  });
});

describe('parsePublishedAt', () => {
  it('parses ISO 8601 with Z', () => {
    const d = parsePublishedAt('2026-08-10T08:15:00Z');
    expect(d?.toISOString()).toBe('2026-08-10T08:15:00.000Z');
  });

  it('parses ISO 8601 with timezone offset', () => {
    const d = parsePublishedAt('2026-08-11T14:02:33+08:00');
    expect(d?.toISOString()).toBe('2026-08-11T06:02:33.000Z');
  });

  it('parses "YYYY-MM-DD HH:mm:ss" with no timezone as UTC', () => {
    const d = parsePublishedAt('2026-08-10 08:20:00');
    expect(d?.toISOString()).toBe('2026-08-10T08:20:00.000Z');
  });

  it('parses unix timestamp in seconds', () => {
    const d = parsePublishedAt(1786435200);
    expect(d?.toISOString()).toBe('2026-08-11T08:00:00.000Z');
  });

  it('parses DD/MM/YYYY', () => {
    const d = parsePublishedAt('11/08/2026');
    expect(d?.toISOString()).toBe('2026-08-11T00:00:00.000Z');
  });

  it('returns null for null/undefined/empty/invalid input without throwing', () => {
    expect(parsePublishedAt(null)).toBeNull();
    expect(parsePublishedAt(undefined)).toBeNull();
    expect(parsePublishedAt('')).toBeNull();
    expect(parsePublishedAt('not a date')).toBeNull();
  });
});

describe('parseEngagement', () => {
  it('parses comma-formatted strings', () => {
    expect(parseEngagement('3,402')).toBe(3402);
    expect(parseEngagement('1,204')).toBe(1204);
  });

  it('passes through plain numbers', () => {
    expect(parseEngagement(412)).toBe(412);
  });

  it('returns 0 for unparseable values', () => {
    expect(parseEngagement('n/a')).toBe(0);
    expect(parseEngagement(undefined)).toBe(0);
    expect(parseEngagement(NaN)).toBe(0);
  });
});

describe('hashContent', () => {
  it('produces the same hash for the same title+content regardless of casing/whitespace', () => {
    const a = hashContent(
      'Analysts split on second-half GDP outlook',
      'Economists remain divided.',
    );
    const b = hashContent(
      'analysts split on second-half gdp outlook',
      '  Economists   remain divided. ',
    );
    expect(a).toBe(b);
  });

  it('produces different hashes for different content', () => {
    const a = hashContent('Title A', 'Content A');
    const b = hashContent('Title B', 'Content B');
    expect(a).not.toBe(b);
  });

  it('treats punctuation differences in the title as equivalent (seed data: mkn-1201 vs mkn-1202)', () => {
    const a = hashContent(
      'Analysts split on second-half GDP outlook',
      'Economists remain divided on whether growth will hold through Q4, citing external demand risks.',
    );
    const b = hashContent(
      'Analysts split on second half GDP outlook',
      'Economists remain divided on whether growth will hold through Q4, citing external demand risks.',
    );
    expect(a).toBe(b);
  });
});

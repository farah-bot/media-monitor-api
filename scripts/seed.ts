import { readFileSync } from 'fs';
import { join } from 'path';

async function main() {
  const port = process.env.PORT ?? '3000';
  const records = JSON.parse(readFileSync(join(__dirname, '../seed/seed_mentions.json'), 'utf-8'));

  const res = await fetch(`http://localhost:${port}/internal/mentions/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(records),
  });

  const body = await res.json();
  // eslint-disable-next-line no-console
  console.log(JSON.stringify(body, null, 2));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

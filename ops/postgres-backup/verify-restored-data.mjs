import { execFileSync } from 'node:child_process';
import { createDecipheriv, scryptSync } from 'node:crypto';

try {
  const target = new URL(process.env.TARGET_DATABASE_URL);
  if (target.pathname !== '/restore_drill' || !target.searchParams.get('host')?.startsWith('/tmp/lumen-restore-drill.')) {
    throw new Error('Verification requires the isolated restore-drill database.');
  }
  const sql = `SELECT COALESCE(json_agg(ciphertext), '[]'::json) FROM (
    SELECT field_value AS ciphertext FROM members
    CROSS JOIN LATERAL (VALUES (cpf_encrypted), (phone_encrypted),
      (address_zip_encrypted), (address_street_encrypted),
      (address_neighborhood_encrypted)) AS fields(field_value)
    WHERE field_value IS NOT NULL AND field_value <> '' LIMIT 25
  ) AS sample;`;
  const output = execFileSync('psql', [process.env.TARGET_DATABASE_URL, '--no-psqlrc',
    '--set=ON_ERROR_STOP=1', '--tuples-only', '--no-align', '--command', sql],
  { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const sample = JSON.parse(output);
  if (sample.length === 0) {
    console.log('No encrypted member fields in this backup; decryption check not applicable.');
  } else {
    const secret = process.env.FIELD_ENCRYPTION_KEY?.trim();
    if (!secret) throw new Error('FIELD_ENCRYPTION_KEY is required to verify encrypted restored data.');
    const key = scryptSync(secret, 'church-erp-salt', 32);
    for (const ciphertext of sample) {
      const bytes = Buffer.from(ciphertext, 'base64');
      const decipher = createDecipheriv('aes-256-gcm', key, bytes.subarray(0, 12));
      decipher.setAuthTag(bytes.subarray(12, 28));
      // Discard plaintext; only the successful authentication count is logged.
      decipher.update(bytes.subarray(28));
      decipher.final();
    }
    console.log(`Verified decryption of ${sample.length} restored encrypted fields; no personal values logged.`);
  }
} catch {
  console.error('Restored-data verification failed; database contents and secrets omitted.');
  process.exitCode = 1;
}

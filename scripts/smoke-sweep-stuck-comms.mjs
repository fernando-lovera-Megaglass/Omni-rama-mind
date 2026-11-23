import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { buildSweepSql } from './sweep-stuck-comms.mjs';

const db = new PGlite();
try {
  await db.exec(`
    CREATE TABLE call_logs (id integer PRIMARY KEY, status text, duration_sec integer, created_at timestamptz, extra jsonb, last_error text);
    CREATE TABLE twilio_messages (id integer PRIMARY KEY, status text, channel text, created_at timestamptz, error text);
    INSERT INTO call_logs
    SELECT n, CASE WHEN n <= 32 THEN 'ringing' ELSE 'initiated' END, NULL, now() - interval '3 days', '{"keep":true,"notice":"original"}',
      CASE WHEN n = 38 THEN 'provider error' END FROM generate_series(1,38) n;
    INSERT INTO call_logs VALUES
      (39,'completed',NULL,now()-interval '3 days','{}',NULL),
      (40,'ringing',NULL,now(),'{}',NULL),
      (41,'in-progress',9,now()-interval '3 days','{}',NULL),
      (42,'ringing',7,now()-interval '3 days','{"last_error":"failure"}',NULL),
      (43,'initiated',NULL,now()-interval '3 days',NULL,'   ');
    INSERT INTO twilio_messages VALUES
      (1,'queued','sms',now()-interval '3 days',NULL),
      (2,'queued','sms',now()-interval '3 days','existing error'),
      (3,'queued','sms',now(),NULL),
      (4,'queued','whatsapp',now()-interval '3 days',NULL),
      (5,'delivered','sms',now()-interval '3 days',NULL);
  `);
  const run = async () => (await db.exec(buildSweepSql())).flatMap(r => r.rows || []).find(r => r.evidence)?.evidence;
  const report = await run();
  assert.deepEqual(report.before, { stuck_calls: 40, queued_sms: 2 });
  assert.deepEqual(report.after, { stuck_calls: 0, queued_sms: 0 });
  const calls = (await db.query('SELECT * FROM call_logs ORDER BY id')).rows;
  assert.equal(calls[0].status, 'no-answer');
  assert.equal(calls[0].duration_sec, 0);
  assert.equal(calls[0].extra.keep, true);
  assert.equal(calls[0].extra.notice, 'original\nbarrido de residuo 23-nov');
  assert.equal(calls[37].status, 'failed');
  assert.equal(calls[38].status, 'completed');
  assert.equal(calls[38].duration_sec, null);
  assert.equal(calls[39].status, 'ringing');
  assert.equal(calls[40].status, 'in-progress');
  assert.equal(calls[41].status, 'failed');
  assert.equal(calls[41].duration_sec, 7);
  assert.equal(calls[42].status, 'no-answer');
  const sms = (await db.query('SELECT * FROM twilio_messages ORDER BY id')).rows;
  assert.equal(sms[0].extra.notice, 'barrido de residuo 23-nov');
  assert.equal(sms[1].error, 'existing error');
  assert.equal(sms[2].status, 'queued');
  assert.equal(sms[3].status, 'queued');
  assert.equal(sms[4].status, 'delivered');
  assert.deepEqual((await run()).before, { stuck_calls: 0, queued_sms: 0 });
  assert.deepEqual((await db.query('SELECT * FROM call_logs ORDER BY id')).rows, calls);
  // Exact one-hour boundary, using the same transaction clock as the sweep.
  await db.exec('BEGIN');
  await db.exec("INSERT INTO call_logs VALUES (44,'ringing',NULL,now()-interval '1 hour','{}',NULL)");
  await run();
  assert.equal((await db.query('SELECT status FROM call_logs WHERE id=44')).rows[0].status, 'ringing');
  // Historical schema without last_error or extra must also work.
  await db.exec('ALTER TABLE call_logs DROP COLUMN last_error; ALTER TABLE call_logs DROP COLUMN extra');
  await run();
  console.log(JSON.stringify({ environment: 'local PGlite synthetic fixtures', ...report }, null, 2));
  console.log('OK: cutoff, terminal/recent exclusions, error classification, metadata, missing columns, idempotence.');
} finally {
  await db.close();
}

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';
import { assertOperationalDatabase } from '../lib/databaseSafety.mjs';
const url=assertOperationalDatabase(process.env.DATABASE_URL),db=new pg.Client({connectionString:url.href});await db.connect();
try{
  const tables=['users','sport_venues','courts','time_slots','bookings','payments','booking_reschedules','refunds','reviews','audit_logs'],counts={};
  for(const table of tables)counts[table]=Number((await db.query(`SELECT count(*) AS n FROM ${table}`)).rows[0].n);
  const checks={};
  const queries={
    orphanCourts:'SELECT count(*)::int AS n FROM courts c LEFT JOIN sport_venues v ON v.id=c.venue_id WHERE v.id IS NULL',
    orphanSlots:'SELECT count(*)::int AS n FROM time_slots s LEFT JOIN courts c ON c.id=s.court_id WHERE c.id IS NULL',
    orphanBookings:'SELECT count(*)::int AS n FROM bookings b LEFT JOIN time_slots s ON s.id=b.time_slot_id LEFT JOIN users u ON u.id=b.customer_id WHERE s.id IS NULL OR (b.customer_id IS NOT NULL AND u.id IS NULL)',
    invalidSlots:"SELECT count(*)::int AS n FROM time_slots WHERE end_time-start_time <> interval '1 hour' OR start_time<'06:00' OR end_time>'22:00' OR price<0 OR price>100000000 OR (status='HELD' AND held_until IS NULL)",
    duplicateSlots:'SELECT count(*)::int AS n FROM (SELECT court_id,slot_date,start_time,count(*) FROM time_slots GROUP BY 1,2,3 HAVING count(*)>1) x',
    invalidCourtPrices:'SELECT count(*)::int AS n FROM courts WHERE hourly_price<0 OR hourly_price>100000000',
    non16DaySchedules:'SELECT count(*)::int AS n FROM (SELECT court_id,slot_date,count(*) FROM time_slots GROUP BY 1,2 HAVING count(*)<>16) x',
  };
  for(const[key,sql]of Object.entries(queries)){checks[key]=(await db.query(sql)).rows[0].n;assert.equal(checks[key],0,key);}
  const venues=(await db.query('SELECT id,manager_id,name,address,district,description,status,payment_hold_minutes,minimum_online_booking_lead_minutes FROM sport_venues ORDER BY name')).rows;
  const courts=(await db.query('SELECT id,venue_id,name,sport_type,hourly_price,description,status FROM courts ORDER BY venue_id,name')).rows;
  const audits=(await db.query('SELECT id,action,reason,before_data,after_data FROM audit_logs')).rows;
  const marker=/(?:\bQA\b|\bT5\b|TASK\s*\d|fixture|A{8}|S{8}|kiểm thử|dữ liệu mẫu)/i;
  checks.technicalRecords=[...venues,...courts,...audits.map(a=>({action:a.action,reason:a.reason}))].filter(r=>marker.test(Object.values(r).join(' '))).length;assert.equal(checks.technicalRecords,0);
  const seedHistoryAudits=audits.filter(a=>marker.test(JSON.stringify([a.before_data,a.after_data]))).map(a=>({id:a.id,action:a.action,beforeDescription:a.before_data?.description,afterDescription:a.after_data?.description}));
  assert.equal(new Set(courts.map(c=>c.sport_type)).size,5);
  assert.equal(counts.payments,0);assert.equal(counts.reviews,0);assert.equal(counts.refunds,0);
  const report={database:'sportbooking',time:new Date().toISOString(),counts,seedHistoryAudits,migrations:(await db.query('SELECT name,batch FROM knex_migrations ORDER BY id')).rows,columns:(await db.query("SELECT table_name,column_name,data_type,is_nullable FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows,constraints:(await db.query("SELECT conrelid::regclass::text AS table_name,conname,pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY conname")).rows,accounts:(await db.query('SELECT full_name,email,role,is_active FROM users ORDER BY role,email')).rows,venues,courts,slotRange:(await db.query('SELECT min(slot_date),max(slot_date),count(*)::int AS count FROM time_slots')).rows[0],bookingStates:(await db.query('SELECT status,count(*)::int AS n FROM bookings GROUP BY status')).rows,checks};
  const artifacts=new URL('../../test-artifacts/task6.1/',import.meta.url);await mkdir(artifacts,{recursive:true});await writeFile(new URL('database-after.json',artifacts),JSON.stringify(report,null,2));
  const backupDir=new URL('../../.local/backups/',import.meta.url);await mkdir(backupDir,{recursive:true});const filename='sportbooking-'+new Date().toISOString().replace(/[:.]/g,'-')+'.dump';
  const backup=execFileSync('docker',['exec','sportbooking-tv3-task5-db-1','pg_dump','-U','sportbooking','-d','sportbooking','-Fc','--no-owner','--no-acl'],{maxBuffer:64*1024*1024});await writeFile(new URL(filename,backupDir),backup,{mode:0o600});
  await writeFile(new URL('backup.json',artifacts),JSON.stringify({file:'client/.local/backups/'+filename,bytes:backup.length,sha256:createHash('sha256').update(backup).digest('hex'),format:'PostgreSQL custom dump; private local file'},null,2));
  console.log(JSON.stringify({database:'sportbooking',counts,checks,backupBytes:backup.length},null,2));
}finally{await db.end();}

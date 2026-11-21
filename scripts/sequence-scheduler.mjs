// Opt-in local scheduler for sequence-process. Kept for compatibility: the generic minute loop now lives in
// scripts/local-scheduler.mjs (sequence-process + marketing-process); this entry point runs only sequence-process.
// SEQUENCE_LOCAL_URL / SEQUENCE_LOCAL_SERVICE_ROLE_KEY and --once work exactly as before.
if (!process.argv.includes('--functions')) process.argv.push('--functions', 'sequence-process');
await import('./local-scheduler.mjs');

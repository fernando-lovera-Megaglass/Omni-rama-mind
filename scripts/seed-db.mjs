// One-off: importing data.js with the .env vars triggers the Supabase
// bootstrap (fetch + seed if empty). Prints the row count per object.
import { ALL } from '../src/data.js';

for (const type of Object.keys(ALL)) {
  console.log(type, ALL[type]().length);
}

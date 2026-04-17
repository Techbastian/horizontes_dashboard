import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

// simple dotenv parser
const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
  const [k, v] = line.split('=');
  if (k && v) acc[k.trim()] = v.trim();
  return acc;
}, {});

const supabaseUrl = env.VITE_SUPABASE_URL;
const supabaseKey = env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('program_enrollments').select('*').limit(3);
  console.log('Error:', error);
  console.log('Enrollments:', data);
}

check();

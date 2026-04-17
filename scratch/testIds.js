import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
  const [k, v] = line.split('=');
  if (k && v) acc[k.trim()] = v.trim();
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function checkIds() {
  const { data: proj } = await supabase.from('projects').select('id, name, status').eq('status', 'active').single();
  console.log('Active Project:', proj);

  const { data: coh } = await supabase.from('cohorts').select('id, name, program_id').eq('program_id', proj.id).single();
  console.log('Active Cohort:', coh);

  const { data: enrs } = await supabase.from('program_enrollments').select('cohort_id').limit(1);
  console.log('Enrollments point to cohort_id:', enrs[0].cohort_id);
  console.log('Matches:', coh.id === enrs[0].cohort_id);
}

checkIds();

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
  const [k, v] = line.split('=');
  if (k && v) acc[k.trim()] = v.trim();
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function checkIds() {
  const { data: proj } = await supabase.from('projects').select('id').eq('status', 'active').single();
  const { data: coh } = await supabase.from('cohorts').select('id').eq('program_id', proj.id).single();

  const { data: enrs } = await supabase.from('program_enrollments').select('custom_form_data').eq('cohort_id', coh.id);
  console.log('Total enrollments:', enrs.length);
  const rutas = {};
  enrs.forEach(e => {
    const r = e.custom_form_data?.ruta_asignada || 'none';
    rutas[r] = (rutas[r] || 0) + 1;
  });
  console.log('Rutas in enrollments:', rutas);

  const { data: apps } = await supabase.from('project_applications').select('custom_answers').eq('cohort_id', coh.id);
  const gruposApps = {};
  apps.forEach(a => {
    const g = a.custom_answers?.seguimiento_fases?.grupo_asignado || 'none';
    gruposApps[g] = (gruposApps[g] || 0) + 1;
  });
  console.log('Grupos in applications:', gruposApps);
}

checkIds();

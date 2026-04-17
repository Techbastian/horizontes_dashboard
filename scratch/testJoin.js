import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf-8').split('\n').reduce((acc, line) => {
  const [k, v] = line.split('=');
  if (k && v) acc[k.trim()] = v.trim();
  return acc;
}, {});

const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);

async function checkIds() {
  const { data: enrs, error } = await supabase.from('program_enrollments').select(`
    id,
    status,
    custom_form_data,
    created_at,
    candidate:candidates(
      id, first_name, last_name, email, city, document_type, document_number, phone, gender, age
    )
  `).limit(1);
  console.log('Error:', error);
  console.log('Enrollments with candidate:', enrs);
}

checkIds();

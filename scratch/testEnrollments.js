import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkSchema() {
  const { data, error } = await supabase.from('program_enrollments').select('*').limit(1);
  if (error) {
    console.error('Error:', error);
  } else {
    console.log('Enrollments:', data);
  }
}

checkSchema();

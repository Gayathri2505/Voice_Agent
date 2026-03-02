import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://yfuawsfawbiymhxsxkgn.supabase.co';
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InlmdWF3c2Zhd2JpeW1oeHN4a2duIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5ODE3MTAsImV4cCI6MjA4NzU1NzcxMH0.B7q4uyfINSmvZA3V125IsCr8C8XOmvnOuvqRBBga-l0"

if (!supabaseKey) {
  console.error('❌ SUPABASE_KEY env variable is missing');
  console.error('   Run as: SUPABASE_KEY=your_anon_key node test-supabase.js');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function testConnection() {
  console.log('─────────────────────────────────────────');
  console.log('🔌 Supabase Connection Test');
  console.log('─────────────────────────────────────────');
  console.log('URL :', supabaseUrl);
  console.log('─────────────────────────────────────────\n');

  console.log('Test 1 - Checking if Supabase URL is reachable...');

  console.log('Test 2 — Checking if anon key is valid...');
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.error('  ❌ Auth error:', error.message);
    } else {
      console.log('  ✅ Auth OK — anon key is valid\n');
    }
  } catch (err) {
    console.error('  ❌ Auth check failed:', err.message);
  }

  console.log('Test 3 — Reading from sessions table...');
  try {
    const { data, error } = await supabase
      .from('sessions')
      .select('*')
      .limit(1);

    if (error) {
      console.error('  ❌ sessions table error:', error.message);
      console.error('     Code:', error.code);
      if (error.code === '42P01') {
        console.error('     → Table "sessions" does not exist');
      } else if (error.code === 'PGRST301') {
        console.error('     → Row Level Security is blocking access — check RLS policies');
      }
    } else {
      console.log('  ✅ sessions table OK — rows found:', data.length, '\n');
    }
  } catch (err) {
    console.error('  ❌ sessions query failed:', err.message);
  }

  console.log('Test 4 — Reading from customer_info table...');
  try {
    const { data, error } = await supabase
      .from('customer_info')
      .select('*')
      .limit(1);

    if (error) {
      console.error('  ❌ customer_info table error:', error.message);
      console.error('     Code:', error.code);
      if (error.code === '42P01') {
        console.error('     → Table "customer_info" does not exist');
      } else if (error.code === 'PGRST301') {
        console.error('     → Row Level Security is blocking access — check RLS policies');
      }
    } else {
      console.log('  ✅ customer_info table OK — rows found:', data.length, '\n');
    }
  } catch (err) {
    console.error('  ❌ customer_info query failed:', err.message);
  }

  console.log('Test 5 — Reading from n8n_chat_histories table...');
  try {
    const { data, error } = await supabase
      .from('n8n_chat_histories')
      .select('*')
      .limit(1);

    if (error) {
      console.error('  ❌ n8n_chat_histories table error:', error.message);
      console.error('     Code:', error.code);
      if (error.code === '42P01') {
        console.error('     → Table "n8n_chat_histories" does not exist');
      } else if (error.code === 'PGRST301') {
        console.error('     → Row Level Security is blocking access — check RLS policies');
      }
    } else {
      console.log('  ✅ n8n_chat_histories table OK — rows found:', data.length, '\n');
    }
  } catch (err) {
    console.error('  ❌ n8n_chat_histories query failed:', err.message);
  }

  console.log('Test 6 — Write test on n8n_chat_histories...');
  const testSessionId = 'test-connection-' + Date.now();
  try {
    const { data, error } = await supabase
      .from('n8n_chat_histories')
      .insert({
        session_id: testSessionId,
        message:    { type: 'human', content: 'connection test' },
      })
      .select()
      .single();

    if (error) {
      console.error('  ❌ Write failed:', error.message);
      if (error.code === 'PGRST301') {
        console.error('     → RLS policy is blocking INSERT — enable INSERT policy for anon role');
      }
    } else {
      console.log('  ✅ Write OK — inserted row id:', data.id);

      // Clean up test row
      await supabase.from('n8n_chat_histories').delete().eq('id', data.id);
      console.log('  ✅ Cleanup OK — test row deleted\n');
    }
  } catch (err) {
    console.error('  ❌ Write test failed:', err.message);
  }

  console.log('─────────────────────────────────────────');
  console.log('✅ All tests complete');
  console.log('─────────────────────────────────────────');
}

testConnection();
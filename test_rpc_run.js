import { createClient } from '@supabase/supabase-js';

const url = 'https://hxvxifghgqwgjbcliqjx.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dnhpZmdoZ3F3Z2piY2xpcWp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NjYwOTUsImV4cCI6MjA5ODM0MjA5NX0.p942MfQCVmO9lhanR8kgOknGUvqsAEVBB2ogbZSPI68';

const supabase = createClient(url, key);

async function check() {
    console.log('Testing admin_delete_character RPC...');
    try {
        const { data, error } = await supabase.rpc('admin_delete_character', {
            target_char_id: '00000000-0000-0000-0000-000000000000'
        });
        console.log('Data:', data);
        console.log('Error:', error);
    } catch (e) {
        console.log('Exception:', e.message);
    }

    console.log('\nTesting admin_update_character RPC...');
    try {
        const { data, error } = await supabase.rpc('admin_update_character', {
            target_char_id: '00000000-0000-0000-0000-000000000000',
            updates: {}
        });
        console.log('Data:', data);
        console.log('Error:', error);
    } catch (e) {
        console.log('Exception:', e.message);
    }
}

check();

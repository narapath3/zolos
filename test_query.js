import { createClient } from '@supabase/supabase-js';

const url = 'https://hxvxifghgqwgjbcliqjx.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dnhpZmdoZ3F3Z2piY2xpcWp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NjYwOTUsImV4cCI6MjA5ODM0MjA5NX0.p942MfQCVmO9lhanR8kgOknGUvqsAEVBB2ogbZSPI68';

const supabase = createClient(url, key);

async function check() {
    let { data: characters } = await supabase.from('characters').select('name, user_id');
    for (let char of characters) {
        let { data: profile } = await supabase.from('profiles').select('username').eq('id', char.user_id).single();
        console.log(`Character name: "${char.name}", user_id: "${char.user_id}", Profile username: "${profile?.username}"`);
    }
}

check();

import { createClient } from '@supabase/supabase-js';

const url = 'https://hxvxifghgqwgjbcliqjx.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dnhpZmdoZ3F3Z2piY2xpcWp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NjYwOTUsImV4cCI6MjA5ODM0MjA5NX0.p942MfQCVmO9lhanR8kgOknGUvqsAEVBB2ogbZSPI68';

const supabase = createClient(url, key);

async function test() {
    console.log('Testing connection to Supabase...');
    try {
        const { data: charData, error: charError } = await supabase.from('characters').select('*').limit(1);
        console.log('characters error:', charError);
        console.log('characters data:', charData);

        const { data: invData, error: invError } = await supabase.from('inventory').select('*').limit(1);
        console.log('inventory error:', invError);
        console.log('inventory data:', invData);
    } catch (err) {
        console.error('Exception:', err);
    }
}

test();

import { createClient } from '@supabase/supabase-js';

const url = 'https://hxvxifghgqwgjbcliqjx.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dnhpZmdoZ3F3Z2piY2xpcWp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NjYwOTUsImV4cCI6MjA5ODM0MjA5NX0.p942MfQCVmO9lhanR8kgOknGUvqsAEVBB2ogbZSPI68';

const supabase = createClient(url, key);

async function inspect() {
    try {
        console.log('--- Characters table ---');
        const { data: charData, error: charError } = await supabase.from('characters').select('*').limit(1);
        if (charError) console.error('Char Error:', charError);
        if (charData && charData.length > 0) {
            console.log('Columns:', Object.keys(charData[0]));
            console.log('Sample Data:', charData[0]);
        }

        console.log('--- Profiles table ---');
        const { data: profData, error: profError } = await supabase.from('profiles').select('*').limit(1);
        if (profError) console.error('Profile Error:', profError);
        if (profData && profData.length > 0) {
            console.log('Columns:', Object.keys(profData[0]));
            console.log('Sample Data:', profData[0]);
        }
    } catch (e) {
        console.error(e);
    }
}

inspect().then(() => {
    console.log('Inspection complete.');
    process.exit(0);
});

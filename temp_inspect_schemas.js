import { createClient } from '@supabase/supabase-js';

const url = 'https://hxvxifghgqwgjbcliqjx.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dnhpZmdoZ3F3Z2piY2xpcWp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NjYwOTUsImV4cCI6MjA5ODM0MjA5NX0.p942MfQCVmO9lhanR8kgOknGUvqsAEVBB2ogbZSPI68';

const supabase = createClient(url, key);

async function inspect() {
    console.log('--- Characters table ---');
    const { data: charData, error: charError } = await supabase.from('characters').select('*').limit(1);
    console.log('Error:', charError);
    if (charData && charData.length > 0) console.log('Columns:', Object.keys(charData[0]));

    console.log('--- Inventory table ---');
    const { data: invData, error: invError } = await supabase.from('inventory').select('*').limit(1);
    console.log('Error:', invError);
    if (invData && invData.length > 0) console.log('Columns:', Object.keys(invData[0]));

    console.log('--- Marketplace table ---');
    const { data: marketData, error: marketError } = await supabase.from('marketplace').select('*').limit(1);
    console.log('Error:', marketError);
    if (marketData && marketData.length > 0) console.log('Columns:', Object.keys(marketData[0]));

    console.log('--- Market History table ---');
    const { data: histData, error: histError } = await supabase.from('market_history').select('*').limit(1);
    console.log('Error:', histError);
    if (histData && histData.length > 0) console.log('Columns:', Object.keys(histData[0]));
}

inspect();

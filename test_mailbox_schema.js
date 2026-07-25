import { createClient } from '@supabase/supabase-js';

const url = 'https://hxvxifghgqwgjbcliqjx.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dnhpZmdoZ3F3Z2piY2xpcWp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NjYwOTUsImV4cCI6MjA5ODM0MjA5NX0.p942MfQCVmO9lhanR8kgOknGUvqsAEVBB2ogbZSPI68';

const supabase = createClient(url, key);

async function check() {
    console.log('--- Checking card_mailbox table ---');
    const { data, error } = await supabase.from('card_mailbox').select('*').limit(1);
    if (error) {
        console.error('Error querying card_mailbox:', error.message, error.code);
    } else {
        console.log('Successfully queried card_mailbox! Row count:', data.length);
        console.log('Row structure:', data[0]);
    }

    console.log('\n--- Checking RPC send_card_mail ---');
    const { data: rpc1, error: error1 } = await supabase.rpc('send_card_mail', {
        p_recipient_char_id: 'test',
        p_item_name: 'test',
        p_item_type: 'card',
        p_quantity: 1,
        p_price: 0,
        p_stats: {}
    });
    console.log('send_card_mail response:', rpc1);
    console.log('send_card_mail error:', error1 ? error1.message : 'none');
}

check();

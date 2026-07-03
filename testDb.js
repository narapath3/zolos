import { createClient } from '@supabase/supabase-js';

const url = 'https://hxvxifghgqwgjbcliqjx.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dnhpZmdoZ3F3Z2piY2xpcWp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NjYwOTUsImV4cCI6MjA5ODM0MjA5NX0.p942MfQCVmO9lhanR8kgOknGUvqsAEVBB2ogbZSPI68';

// Create separate clients representing two players
const sellerSupabase = createClient(url, key, { auth: { persistSession: false } });
const buyerSupabase = createClient(url, key, { auth: { persistSession: false } });

async function test() {
    console.log('=== Step 1: Sign up & Sign in Seller (User A) ===');
    const sellerRand = Math.random().toString(36).substring(2, 10);
    const sellerEmail = `seller_${sellerRand}@zolos.game`;
    const password = 'TestPassword123!';

    const { data: sellerAuth, error: sellerAuthErr } = await sellerSupabase.auth.signUp({
        email: sellerEmail,
        password,
        options: { data: { username: `Seller_${sellerRand}` } }
    });

    if (sellerAuthErr) {
        console.error('Seller Sign-up failed:', sellerAuthErr.message);
        return;
    }
    const sellerUserId = sellerAuth.user.id;
    console.log('Seller registered and logged in:', sellerUserId);

    console.log('\n=== Step 2: Seller inserts a marketplace listing ===');
    const itemId = 'item_' + Math.random().toString(36).substring(2, 12);
    const testListing = {
        item_id: itemId,
        item_name: 'Apple',
        item_type: 'consumable',
        quantity: 1,
        price: 150,
        seller_id: sellerUserId,
        seller_name: `Seller_${sellerRand}`,
        stats: {},
        created_at: new Date().toISOString()
    };

    const { data: insertData, error: insertError } = await sellerSupabase
        .from('marketplace')
        .insert(testListing)
        .select()
        .single();

    if (insertError) {
        console.error('❌ Insert failed:', insertError.code, insertError.message);
        return;
    }
    console.log('✅ Insert SUCCESS! Listing ID:', insertData.id);

    console.log('\n=== Step 3: Sign up & Sign in Buyer (User B) ===');
    const buyerRand = Math.random().toString(36).substring(2, 10);
    const buyerEmail = `buyer_${buyerRand}@zolos.game`;

    const { data: buyerAuth, error: buyerAuthErr } = await buyerSupabase.auth.signUp({
        email: buyerEmail,
        password,
        options: { data: { username: `Buyer_${buyerRand}` } }
    });

    if (buyerAuthErr) {
        console.error('Buyer Sign-up failed:', buyerAuthErr.message);
        // Clean up listing using seller
        await sellerSupabase.from('marketplace').delete().eq('id', insertData.id);
        return;
    }
    const buyerUserId = buyerAuth.user.id;
    console.log('Buyer registered and logged in:', buyerUserId);

    console.log('\n=== Step 4: Buyer attempts to buy (delete) Seller\'s listing ===');
    // Simulate what buyMarketItem() does: attempts to delete the listing by id
    const { data: buyDeleteData, error: buyDeleteErr } = await buyerSupabase
        .from('marketplace')
        .delete()
        .eq('id', insertData.id)
        .select();

    if (buyDeleteErr) {
        console.log('❌ Buyer delete failed (as expected if RLS prevents deleting others\' listings):');
        console.log('   Error Code:', buyDeleteErr.code);
        console.log('   Message:', buyDeleteErr.message);
    } else {
        console.log('Buyer delete query response (data):', buyDeleteData);
        if (buyDeleteData && buyDeleteData.length > 0) {
            console.log('✅ SUCCESS: Buyer was able to delete (buy) the marketplace listing!');
        } else {
            console.log('❌ RLS BLOCKED DELETE: Response data is empty which means no row was deleted!');
        }
    }

    // Cleanup: Ensure the listing is deleted (Seller deletes it if Buyer couldn't)
    const { data: checkData } = await sellerSupabase
        .from('marketplace')
        .select('*')
        .eq('id', insertData.id);

    if (checkData && checkData.length > 0) {
        console.log('\n=== Step 5: Cleaning up listing via Seller ===');
        const { error: cleanupErr } = await sellerSupabase
            .from('marketplace')
            .delete()
            .eq('id', insertData.id);
        console.log('Seller cleanup result:', cleanupErr ? cleanupErr.message : 'SUCCESS');
    } else {
        console.log('\n=== Step 5: Listing already deleted, no cleanup needed ===');
    }
}

test();


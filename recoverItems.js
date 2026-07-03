// Recovery Script — กู้ไอเทมที่หายจาก P2P Marketplace bug
// วิธีใช้: node recoverItems.js <username> <password> <item_name> <quantity>
// ตัวอย่าง: node recoverItems.js narapath3 MyPassword123 "Apple" 5

import { createClient } from '@supabase/supabase-js';

const url = 'https://hxvxifghgqwgjbcliqjx.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh4dnhpZmdoZ3F3Z2piY2xpcWp4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI3NjYwOTUsImV4cCI6MjA5ODM0MjA5NX0.p942MfQCVmO9lhanR8kgOknGUvqsAEVBB2ogbZSPI68';

const supabase = createClient(url, key);

const args = process.argv.slice(2);
if (args.length < 4) {
    console.log('Usage: node recoverItems.js <username> <password> <item_name> <quantity>');
    console.log('Example: node recoverItems.js narapath3 MyPassword123 "Apple" 5');
    process.exit(1);
}

const [username, password, itemName, qtyStr] = args;
const quantity = parseInt(qtyStr);

async function recover() {
    console.log(`\n=== Recovering ${quantity}x ${itemName} for user: ${username} ===\n`);

    // Step 1: Sign in
    const email = `${username}@zolos.game`;
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
        console.error('❌ Sign-in failed:', authError.message);
        return;
    }
    const userId = authData.user.id;
    console.log('✅ Signed in as:', userId);

    // Step 2: Find character
    const { data: charData, error: charErr } = await supabase
        .from('characters')
        .select('id, name')
        .eq('user_id', userId)
        .single();

    if (charErr || !charData) {
        console.error('❌ Character not found:', charErr?.message);
        return;
    }
    console.log('✅ Found character:', charData.name, '(id:', charData.id, ')');

    // Step 3: Check current inventory for this item
    const { data: invData } = await supabase
        .from('inventory')
        .select('*')
        .eq('character_id', charData.id)
        .eq('item_name', itemName)
        .single();

    if (invData) {
        // Item exists, add quantity
        const newQty = invData.quantity + quantity;
        const { error: updateErr } = await supabase
            .from('inventory')
            .update({ quantity: newQty })
            .eq('id', invData.id);

        if (updateErr) {
            console.error('❌ Failed to update inventory:', updateErr.message);
        } else {
            console.log(`✅ Updated ${itemName}: ${invData.quantity} → ${newQty}`);
        }
    } else {
        // Item doesn't exist, insert new
        const { error: insertErr } = await supabase
            .from('inventory')
            .insert({
                character_id: charData.id,
                item_name: itemName,
                item_type: 'consumable',
                quantity: quantity,
                stats: {}
            });

        if (insertErr) {
            console.error('❌ Failed to insert inventory item:', insertErr.message);
        } else {
            console.log(`✅ Inserted ${quantity}x ${itemName} into inventory`);
        }
    }

    // Step 4: Show current inventory
    const { data: allInv } = await supabase
        .from('inventory')
        .select('item_name, quantity')
        .eq('character_id', charData.id);

    console.log('\n📦 Current inventory:');
    (allInv || []).forEach(i => {
        console.log(`   ${i.item_name}: x${i.quantity}`);
    });
}

recover();

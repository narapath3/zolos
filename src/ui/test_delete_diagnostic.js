// Diagnostic script for delete player issue
// This script helps identify what's preventing player deletion

export async function runDeleteDiagnostic(supabase, charId) {
    console.log('\n========== DELETE DIAGNOSTIC START ==========');
    console.log('Character ID:', charId);
    
    try {
        // Test 1: Check if we can read the character
        console.log('\n[Test 1] Checking if character exists...');
        const { data: charData, error: readError } = await supabase
            .from('characters')
            .select('id, name')
            .eq('id', charId)
            .single();
        
        if (readError) {
            console.error('❌ Cannot read character:', readError);
            return { success: false, reason: 'Cannot read character', error: readError };
        }
        console.log('✅ Character exists:', charData);
        
        // Test 2: Try to delete with verbose error
        console.log('\n[Test 2] Attempting to delete character...');
        const { error: deleteError, data: deleteData, status } = await supabase
            .from('characters')
            .delete()
            .eq('id', charId)
            .select();
        
        console.log('Delete response:', { status, deleteError, deleteData });
        
        if (deleteError) {
            console.error('❌ Delete failed with error:');
            console.error('  Code:', deleteError.code);
            console.error('  Message:', deleteError.message);
            console.error('  Details:', deleteError.details);
            console.error('  Hint:', deleteError.hint);
            
            if (deleteError.code === '42501') {
                return { 
                    success: false, 
                    reason: 'RLS Policy Violation', 
                    error: deleteError,
                    suggestion: 'Check Supabase RLS policies - anon user may not have DELETE permission'
                };
            }
            return { success: false, reason: 'Delete error', error: deleteError };
        }
        
        // Test 3: Verify deletion
        console.log('\n[Test 3] Verifying character was deleted...');
        const { data: verifyData, error: verifyError } = await supabase
            .from('characters')
            .select('id')
            .eq('id', charId);
        
        if (verifyError) {
            console.error('❌ Verification query failed:', verifyError);
            return { success: false, reason: 'Verification failed', error: verifyError };
        }
        
        if (verifyData && verifyData.length === 0) {
            console.log('✅ Character successfully deleted!');
            return { success: true, reason: 'Character deleted successfully' };
        } else {
            console.warn('⚠️ Character still exists after delete:', verifyData);
            return { success: false, reason: 'Character still exists after delete', data: verifyData };
        }
        
    } catch (err) {
        console.error('❌ Exception during diagnostic:', err);
        return { success: false, reason: 'Exception', error: err };
    } finally {
        console.log('========== DELETE DIAGNOSTIC END ==========\n');
    }
}

// Export for use in AdminUI
export default runDeleteDiagnostic;

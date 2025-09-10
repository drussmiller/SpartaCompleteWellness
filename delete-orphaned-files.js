
import fs from 'fs';
import path from 'path';

function deleteOrphanedFiles() {
  console.log('🗑️  Starting deletion of orphaned files...\n');
  
  // Read the list of orphaned files
  if (!fs.existsSync('orphaned-files-list.json')) {
    console.error('❌ No orphaned files list found. Run find-orphaned-files.js first.');
    return;
  }
  
  const orphanedFiles = JSON.parse(fs.readFileSync('orphaned-files-list.json', 'utf-8'));
  
  if (orphanedFiles.length === 0) {
    console.log('✅ No files to delete.');
    return;
  }
  
  console.log(`Found ${orphanedFiles.length} files to delete.\n`);
  
  let deletedCount = 0;
  let errorCount = 0;
  let totalSizeFreed = 0;
  
  for (const filePath of orphanedFiles) {
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.statSync(filePath);
        const sizeKB = (stats.size / 1024).toFixed(2);
        
        fs.unlinkSync(filePath);
        console.log(`✅ Deleted: ${filePath} (${sizeKB} KB)`);
        
        deletedCount++;
        totalSizeFreed += stats.size;
      } else {
        console.log(`⚠️  File not found: ${filePath}`);
      }
    } catch (error) {
      console.error(`❌ Error deleting ${filePath}:`, error.message);
      errorCount++;
    }
  }
  
  const totalFreedMB = (totalSizeFreed / (1024 * 1024)).toFixed(2);
  
  console.log(`\n📊 DELETION SUMMARY:`);
  console.log(`- Files deleted: ${deletedCount}`);
  console.log(`- Errors: ${errorCount}`);
  console.log(`- Space freed: ${totalFreedMB} MB`);
  
  // Clean up the list file
  if (deletedCount > 0) {
    fs.unlinkSync('orphaned-files-list.json');
    console.log(`\n🧹 Cleaned up orphaned-files-list.json`);
  }
}

// Confirm before deletion
console.log('⚠️  WARNING: This will permanently delete orphaned files.');
console.log('Make sure you have run find-orphaned-files.js first and reviewed the list.');
console.log('Press Ctrl+C to cancel, or any key to continue...');

process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on('data', () => {
  process.stdin.setRawMode(false);
  deleteOrphanedFiles();
  process.exit(0);
});

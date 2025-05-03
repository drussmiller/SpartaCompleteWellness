/**
 * Test script for MOV Frame Extractor
 * 
 * This script tests the specialized MOV frame extraction functions
 */
import fs from 'fs';
import path from 'path';
import { 
  extractMovFrame,
  createAllMovThumbnailVariants,
  createFallbackSvgThumbnails
} from './mov-frame-extractor';

async function testMovExtractor() {
  console.log('Testing MOV Frame Extractor...');
  
  // Look for a MOV file in uploads directory
  const uploadsDir = path.join(process.cwd(), 'uploads');
  const outputDir = path.join(process.cwd(), 'uploads', 'test');
  
  // Create output directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Find MOV files
  let movFiles: string[] = [];
  try {
    const files = fs.readdirSync(uploadsDir);
    movFiles = files.filter(file => file.toLowerCase().endsWith('.mov'));
  } catch (err) {
    console.error('Error reading uploads directory:', err);
    return;
  }
  
  if (movFiles.length === 0) {
    console.log('No MOV files found in uploads directory. Cannot run test.');
    return;
  }
  
  // Use the first MOV file for testing
  const testFile = movFiles[0];
  const sourcePath = path.join(uploadsDir, testFile);
  
  console.log(`Found MOV file to test: ${testFile}`);
  console.log(`Source path: ${sourcePath}`);
  
  // Test basic frame extraction
  console.log('\n--- Testing basic frame extraction ---');
  const outputPath = path.join(outputDir, 'test-frame.jpg');
  console.log(`Output path: ${outputPath}`);
  
  try {
    await extractMovFrame(sourcePath, outputPath);
    const stats = fs.statSync(outputPath);
    console.log(`✅ Basic frame extraction successful! File size: ${stats.size} bytes`);
  } catch (err) {
    console.error('❌ Basic frame extraction failed:', err);
    return;
  }
  
  // Test creating all thumbnail variants
  console.log('\n--- Testing all thumbnail variants ---');
  const targetThumbPath = path.join(outputDir, `thumb-${testFile}`);
  console.log(`Target thumbnail path: ${targetThumbPath}`);
  
  try {
    const results = await createAllMovThumbnailVariants(sourcePath, targetThumbPath);
    console.log('All paths generated:');
    
    // Log the results and verify files exist
    for (const [key, filePath] of Object.entries(results)) {
      const exists = fs.existsSync(filePath);
      const fileSize = exists ? fs.statSync(filePath).size : 0;
      console.log(`- ${key}: ${path.basename(filePath)} (exists: ${exists}, size: ${fileSize} bytes)`);
    }
    
    console.log('✅ All thumbnail variants created successfully!');
  } catch (err) {
    console.error('❌ Creating thumbnail variants failed:', err);
  }
  
  // Test fallback SVG thumbnails
  console.log('\n--- Testing fallback SVG thumbnails ---');
  const fallbackDir = path.join(outputDir, 'fallback');
  
  // Create fallback directory if it doesn't exist
  if (!fs.existsSync(fallbackDir)) {
    fs.mkdirSync(fallbackDir, { recursive: true });
  }
  
  const fallbackPaths = {
    jpgThumbPath: path.join(fallbackDir, testFile.replace('.mov', '.jpg')),
    movThumbPath: path.join(fallbackDir, testFile),
    posterPath: path.join(fallbackDir, testFile.replace('.mov', '.poster.jpg')),
    nonPrefixedThumbPath: path.join(fallbackDir, testFile.replace('.mov', '.thumb.jpg'))
  };
  
  try {
    await createFallbackSvgThumbnails(fallbackPaths);
    
    // Verify files were created
    for (const [key, filePath] of Object.entries(fallbackPaths)) {
      const exists = fs.existsSync(filePath);
      const fileSize = exists ? fs.statSync(filePath).size : 0;
      console.log(`- ${key}: ${path.basename(filePath)} (exists: ${exists}, size: ${fileSize} bytes)`);
    }
    
    console.log('✅ Fallback SVG thumbnails created successfully!');
  } catch (err) {
    console.error('❌ Creating fallback SVG thumbnails failed:', err);
  }
}

// Run the tests
console.log('Starting MOV Frame Extractor tests...');
testMovExtractor()
  .then(() => console.log('\nAll tests completed!'))
  .catch(err => console.error('\nTests failed:', err));
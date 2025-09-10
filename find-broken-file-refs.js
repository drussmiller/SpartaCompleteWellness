
const fs = require('fs');
const path = require('path');

// File extensions to search for in code
const FILE_EXTENSIONS = ['.jpg', '.jpeg', '.mov', '.mp4', '.png', '.gif', '.webp'];

// Directories to search for code files
const CODE_DIRS = ['client/src', 'server', 'shared'];

// Directories where actual files should exist
const FILE_DIRS = [
  'uploads',
  'server/uploads', 
  'shared/uploads',
  'client/public',
  'attached_assets'
];

// Code file extensions to scan
const CODE_FILE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.css'];

function findFilesInDirectory(dir, extensions) {
  const files = [];
  
  if (!fs.existsSync(dir)) {
    return files;
  }
  
  function scan(currentDir) {
    const items = fs.readdirSync(currentDir);
    
    for (const item of items) {
      const fullPath = path.join(currentDir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        scan(fullPath);
      } else if (extensions.includes(path.extname(item).toLowerCase())) {
        files.push(fullPath);
      }
    }
  }
  
  scan(dir);
  return files;
}

function extractFileReferences(content, filePath) {
  const references = [];
  
  // Common patterns for file references
  const patterns = [
    // src="..." or href="..."
    /(?:src|href)=["']([^"']*\.(?:jpg|jpeg|mov|mp4|png|gif|webp))[^"']*["']/gi,
    // url(...) in CSS
    /url\(["']?([^"')]*\.(?:jpg|jpeg|mov|mp4|png|gif|webp))[^"')]*["']?\)/gi,
    // Direct string references
    /["']([^"']*\.(?:jpg|jpeg|mov|mp4|png|gif|webp))[^"']*["']/gi,
    // Import statements
    /import.*["']([^"']*\.(?:jpg|jpeg|mov|mp4|png|gif|webp))[^"']*["']/gi,
    // Template literals with file extensions
    /`[^`]*\.(?:jpg|jpeg|mov|mp4|png|gif|webp)[^`]*`/gi
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const ref = match[1] || match[0];
      if (ref && FILE_EXTENSIONS.some(ext => ref.toLowerCase().includes(ext))) {
        references.push({
          reference: ref,
          line: content.substring(0, match.index).split('\n').length,
          context: content.substring(Math.max(0, match.index - 50), match.index + 100)
        });
      }
    }
  }
  
  return references;
}

function resolveFilePath(reference, basePath) {
  // Clean up the reference
  let cleanRef = reference.replace(/['"]/g, '').trim();
  
  // Remove URL parameters and fragments
  cleanRef = cleanRef.split('?')[0].split('#')[0];
  
  // Handle different reference types
  const possiblePaths = [];
  
  // Direct path from root
  if (cleanRef.startsWith('/')) {
    possiblePaths.push(path.join(process.cwd(), cleanRef.substring(1)));
  }
  
  // Relative to current file
  possiblePaths.push(path.resolve(path.dirname(basePath), cleanRef));
  
  // Common base paths
  possiblePaths.push(path.join(process.cwd(), cleanRef));
  possiblePaths.push(path.join(process.cwd(), 'uploads', path.basename(cleanRef)));
  possiblePaths.push(path.join(process.cwd(), 'server/uploads', path.basename(cleanRef)));
  possiblePaths.push(path.join(process.cwd(), 'shared/uploads', path.basename(cleanRef)));
  possiblePaths.push(path.join(process.cwd(), 'client/public', cleanRef));
  possiblePaths.push(path.join(process.cwd(), 'attached_assets', path.basename(cleanRef)));
  
  return possiblePaths;
}

async function findBrokenReferences() {
  console.log('🔍 Searching for broken file references...\n');
  
  const brokenRefs = [];
  let totalRefs = 0;
  
  // Get all code files
  const codeFiles = [];
  for (const dir of CODE_DIRS) {
    codeFiles.push(...findFilesInDirectory(dir, CODE_FILE_EXTENSIONS));
  }
  
  console.log(`📁 Scanning ${codeFiles.length} code files...\n`);
  
  for (const codeFile of codeFiles) {
    try {
      const content = fs.readFileSync(codeFile, 'utf-8');
      const references = extractFileReferences(content, codeFile);
      
      for (const ref of references) {
        totalRefs++;
        const possiblePaths = resolveFilePath(ref.reference, codeFile);
        
        // Check if any of the possible paths exist
        const existingPath = possiblePaths.find(p => fs.existsSync(p));
        
        if (!existingPath) {
          brokenRefs.push({
            file: codeFile,
            reference: ref.reference,
            line: ref.line,
            context: ref.context.replace(/\s+/g, ' ').trim(),
            attemptedPaths: possiblePaths.slice(0, 3) // Show first 3 attempted paths
          });
        }
      }
    } catch (error) {
      console.error(`❌ Error reading ${codeFile}:`, error.message);
    }
  }
  
  // Report results
  console.log(`📊 SCAN RESULTS:`);
  console.log(`- Total file references found: ${totalRefs}`);
  console.log(`- Broken references: ${brokenRefs.length}`);
  console.log(`- Working references: ${totalRefs - brokenRefs.length}\n`);
  
  if (brokenRefs.length > 0) {
    console.log(`🚨 BROKEN FILE REFERENCES:\n`);
    
    brokenRefs.forEach((broken, index) => {
      console.log(`${index + 1}. File: ${broken.file}`);
      console.log(`   Line: ${broken.line}`);
      console.log(`   Reference: ${broken.reference}`);
      console.log(`   Context: ${broken.context}`);
      console.log(`   Attempted paths:`);
      broken.attemptedPaths.forEach(p => console.log(`     - ${p}`));
      console.log('');
    });
    
    // Group by file for easier fixing
    const byFile = {};
    brokenRefs.forEach(ref => {
      if (!byFile[ref.file]) byFile[ref.file] = [];
      byFile[ref.file].push(ref);
    });
    
    console.log(`📝 SUMMARY BY FILE:\n`);
    Object.entries(byFile).forEach(([file, refs]) => {
      console.log(`${file} (${refs.length} broken references)`);
      refs.forEach(ref => {
        console.log(`  - Line ${ref.line}: ${ref.reference}`);
      });
      console.log('');
    });
  } else {
    console.log(`✅ No broken file references found!`);
  }
  
  return brokenRefs;
}

// Run the analysis
findBrokenReferences()
  .then(brokenRefs => {
    if (brokenRefs.length > 0) {
      console.log(`\n💡 To fix these issues:`);
      console.log(`1. Remove unused references`);
      console.log(`2. Update paths to point to existing files`);
      console.log(`3. Add missing files to the appropriate directories`);
    }
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error during analysis:', error);
    process.exit(1);
  });


const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

// Database connection
const pool = new Client({
  connectionString: process.env.DATABASE_URL,
});

// File extensions to consider
const MEDIA_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov', '.webm', '.avi', '.mkv', '.svg'];

// Directories to scan for physical files
const UPLOAD_DIRS = [
  'uploads',
  'server/uploads', 
  'shared/uploads',
  'server/shared/uploads'
];

// Directories to search for code files
const CODE_DIRS = ['client/src', 'server', 'shared'];

// Code file extensions to scan
const CODE_FILE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

function getAllFilesInDirectory(dir, extensions = []) {
  const files = [];
  
  if (!fs.existsSync(dir)) {
    return files;
  }
  
  function scan(currentDir) {
    try {
      const items = fs.readdirSync(currentDir);
      
      for (const item of items) {
        const fullPath = path.join(currentDir, item);
        const stat = fs.statSync(fullPath);
        
        if (stat.isDirectory()) {
          scan(fullPath);
        } else if (extensions.length === 0 || extensions.includes(path.extname(item).toLowerCase())) {
          files.push(fullPath);
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${currentDir}:`, error.message);
    }
  }
  
  scan(dir);
  return files;
}

function extractFileReferencesFromCode(content) {
  const references = [];
  
  // Patterns to find file references in code
  const patterns = [
    // src="..." or href="..."
    /(?:src|href)=["']([^"']*\.(?:jpg|jpeg|png|gif|webp|mp4|mov|webm|avi|mkv|svg))[^"']*["']/gi,
    // url(...) in CSS
    /url\(["']?([^"')]*\.(?:jpg|jpeg|png|gif|webp|mp4|mov|webm|avi|mkv|svg))[^"')]*["']?\)/gi,
    // Direct string references
    /["']([^"']*\.(?:jpg|jpeg|png|gif|webp|mp4|mov|webm|avi|mkv|svg))[^"']*["']/gi,
    // mediaUrl, image_url, imageUrl patterns
    /(?:mediaUrl|image_url|imageUrl):\s*["']([^"']*\.(?:jpg|jpeg|png|gif|webp|mp4|mov|webm|avi|mkv|svg))[^"']*["']/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const ref = match[1];
      if (ref && MEDIA_EXTENSIONS.some(ext => ref.toLowerCase().includes(ext))) {
        // Clean up the reference - extract just the filename
        const filename = path.basename(ref);
        references.push(filename);
      }
    }
  }
  
  return references;
}

async function getFileReferencesFromDatabase() {
  const references = new Set();
  
  try {
    await pool.connect();
    
    // Get all media URLs from posts table
    const postsResult = await pool.query(`
      SELECT mediaUrl, image_url 
      FROM posts 
      WHERE mediaUrl IS NOT NULL OR image_url IS NOT NULL
    `);
    
    postsResult.rows.forEach(row => {
      if (row.mediaurl) {
        const filename = path.basename(row.mediaurl);
        references.add(filename);
      }
      if (row.image_url) {
        const filename = path.basename(row.image_url);
        references.add(filename);
      }
    });
    
    // Get any other media references from users table (profile images)
    const usersResult = await pool.query(`
      SELECT imageUrl 
      FROM users 
      WHERE imageUrl IS NOT NULL
    `);
    
    usersResult.rows.forEach(row => {
      if (row.imageurl) {
        const filename = path.basename(row.imageurl);
        references.add(filename);
      }
    });
    
    console.log(`Found ${references.size} file references in database`);
    
  } catch (error) {
    console.error('Error querying database:', error.message);
  } finally {
    await pool.end();
  }
  
  return references;
}

function getFileReferencesFromCode() {
  const references = new Set();
  
  // Get all code files
  const codeFiles = [];
  for (const dir of CODE_DIRS) {
    codeFiles.push(...getAllFilesInDirectory(dir, CODE_FILE_EXTENSIONS));
  }
  
  console.log(`Scanning ${codeFiles.length} code files...`);
  
  for (const codeFile of codeFiles) {
    try {
      const content = fs.readFileSync(codeFile, 'utf-8');
      const fileRefs = extractFileReferencesFromCode(content);
      fileRefs.forEach(ref => references.add(ref));
    } catch (error) {
      console.error(`Error reading ${codeFile}:`, error.message);
    }
  }
  
  console.log(`Found ${references.size} file references in code`);
  return references;
}

async function findOrphanedFiles() {
  console.log('🔍 Finding orphaned files in uploads directories...\n');
  
  // Get all physical files
  const physicalFiles = new Set();
  const fileLocationMap = new Map(); // filename -> full path
  
  for (const dir of UPLOAD_DIRS) {
    const files = getAllFilesInDirectory(dir, MEDIA_EXTENSIONS);
    console.log(`Found ${files.length} media files in ${dir}`);
    
    files.forEach(filePath => {
      const filename = path.basename(filePath);
      physicalFiles.add(filename);
      
      // Store the location of each file
      if (!fileLocationMap.has(filename)) {
        fileLocationMap.set(filename, []);
      }
      fileLocationMap.get(filename).push(filePath);
    });
  }
  
  console.log(`\nTotal physical files found: ${physicalFiles.size}\n`);
  
  // Get all references from database and code
  const dbReferences = await getFileReferencesFromDatabase();
  const codeReferences = getFileReferencesFromCode();
  
  // Combine all references
  const allReferences = new Set([...dbReferences, ...codeReferences]);
  console.log(`Total references found: ${allReferences.size}\n`);
  
  // Find orphaned files
  const orphanedFiles = [];
  const referencedFiles = [];
  
  for (const filename of physicalFiles) {
    // Check if this file (or variations) is referenced
    let isReferenced = false;
    
    // Direct filename match
    if (allReferences.has(filename)) {
      isReferenced = true;
    }
    
    // Check for filename without timestamp prefix (for generated files)
    if (!isReferenced) {
      const withoutTimestamp = filename.replace(/^\d+-[a-z0-9]+-/, '');
      if (withoutTimestamp !== filename && allReferences.has(withoutTimestamp)) {
        isReferenced = true;
      }
    }
    
    // Check for thumbnail variations
    if (!isReferenced) {
      const thumbVariations = [
        `thumb-${filename}`,
        filename.replace('thumb-', ''),
        filename.replace(/\.[^.]+$/, '.poster.jpg'),
        filename.replace(/\.[^.]+$/, '.jpg'),
      ];
      
      for (const variation of thumbVariations) {
        if (allReferences.has(variation)) {
          isReferenced = true;
          break;
        }
      }
    }
    
    if (isReferenced) {
      referencedFiles.push(filename);
    } else {
      orphanedFiles.push({
        filename,
        paths: fileLocationMap.get(filename)
      });
    }
  }
  
  // Results
  console.log(`📊 RESULTS:`);
  console.log(`- Total physical files: ${physicalFiles.size}`);
  console.log(`- Referenced files: ${referencedFiles.length}`);
  console.log(`- Orphaned files: ${orphanedFiles.length}\n`);
  
  if (orphanedFiles.length > 0) {
    console.log(`🗑️  ORPHANED FILES (safe to delete):\n`);
    
    let totalSize = 0;
    
    orphanedFiles.forEach((file, index) => {
      console.log(`${index + 1}. ${file.filename}`);
      
      file.paths.forEach(filePath => {
        try {
          const stats = fs.statSync(filePath);
          const sizeKB = (stats.size / 1024).toFixed(2);
          totalSize += stats.size;
          console.log(`   📁 ${filePath} (${sizeKB} KB)`);
        } catch (error) {
          console.log(`   📁 ${filePath} (size unknown)`);
        }
      });
      console.log('');
    });
    
    const totalSizeMB = (totalSize / (1024 * 1024)).toFixed(2);
    console.log(`💾 Total space that can be freed: ${totalSizeMB} MB\n`);
    
    // Generate deletion script
    console.log(`💡 To delete these files, you can run:`);
    console.log(`node delete-orphaned-files.js\n`);
    
    // Save list for deletion script
    const deletionList = orphanedFiles.flatMap(file => file.paths);
    fs.writeFileSync('orphaned-files-list.json', JSON.stringify(deletionList, null, 2));
    console.log(`📝 Orphaned files list saved to: orphaned-files-list.json`);
    
  } else {
    console.log(`✅ No orphaned files found! All files are properly referenced.`);
  }
  
  return orphanedFiles;
}

// Run the analysis
findOrphanedFiles()
  .then(orphanedFiles => {
    process.exit(0);
  })
  .catch(error => {
    console.error('❌ Error during analysis:', error);
    process.exit(1);
  });

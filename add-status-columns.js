
const { Client } = require('pg');

async function addStatusColumns() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/sparta'
  });

  try {
    await client.connect();
    console.log('Connected to database');

    // Add status column to organizations table
    try {
      await client.query(`
        ALTER TABLE organizations 
        ADD COLUMN IF NOT EXISTS status INTEGER DEFAULT 1
      `);
      console.log('✓ Added status column to organizations table');
    } catch (error) {
      console.log('Status column may already exist in organizations:', error.message);
    }

    // Add status column to groups table
    try {
      await client.query(`
        ALTER TABLE groups 
        ADD COLUMN IF NOT EXISTS status INTEGER DEFAULT 1
      `);
      console.log('✓ Added status column to groups table');
    } catch (error) {
      console.log('Status column may already exist in groups:', error.message);
    }

    // Add status column to teams table
    try {
      await client.query(`
        ALTER TABLE teams 
        ADD COLUMN IF NOT EXISTS status INTEGER DEFAULT 1
      `);
      console.log('✓ Added status column to teams table');
    } catch (error) {
      console.log('Status column may already exist in teams:', error.message);
    }

    // Verify the columns were added
    const orgResult = await client.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'organizations' AND column_name = 'status'
    `);
    
    const groupResult = await client.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'groups' AND column_name = 'status'
    `);
    
    const teamResult = await client.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'teams' AND column_name = 'status'
    `);

    console.log('\n--- Verification Results ---');
    console.log('Organizations status column:', orgResult.rows.length > 0 ? '✓ EXISTS' : '✗ MISSING');
    console.log('Groups status column:', groupResult.rows.length > 0 ? '✓ EXISTS' : '✗ MISSING');
    console.log('Teams status column:', teamResult.rows.length > 0 ? '✓ EXISTS' : '✗ MISSING');

  } catch (error) {
    console.error('Error adding status columns:', error);
  } finally {
    await client.end();
    console.log('Database connection closed');
  }
}

addStatusColumns();


const { Pool } = require('@neondatabase/serverless');
require('dotenv').config();

async function deleteActivities() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not found in environment variables');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: true
  });

  try {
    console.log('Connecting to database...');
    
    // First, let's see how many records will be deleted
    const countResult = await pool.query('SELECT COUNT(*) FROM activities WHERE id > $1', [260]);
    const recordCount = countResult.rows[0].count;
    
    console.log(`Found ${recordCount} activities with id > 260`);
    
    if (recordCount === '0') {
      console.log('No records to delete.');
      return;
    }
    
    // Confirm deletion
    console.log(`Proceeding to delete ${recordCount} records...`);
    
    // Delete the records
    const deleteResult = await pool.query('DELETE FROM activities WHERE id > $1', [260]);
    
    console.log(`Successfully deleted ${deleteResult.rowCount} activities`);
    
  } catch (error) {
    console.error('Error deleting activities:', error);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('Database connection closed.');
  }
}

// Run the deletion
deleteActivities()
  .then(() => {
    console.log('Deletion completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Deletion failed:', error);
    process.exit(1);
  });

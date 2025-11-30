
import pg from 'pg';
const { Pool } = pg;

// Use the same DATABASE_URL from your environment
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: true
});

async function deleteActivities() {
  console.log('Connecting to database...');

  try {
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

deleteActivities();

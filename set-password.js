import { scrypt, randomBytes } from 'crypto';
import { promisify } from 'util';
import { Pool } from '@neondatabase/serverless';

const scryptAsync = promisify(scrypt);
const KEY_LENGTH = 64;

// Function to hash a password, same as in auth.ts
async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  const buf = await scryptAsync(password, salt, KEY_LENGTH);
  return `${buf.toString("hex")}.${salt}`;
}

async function setPassword() {
  // Database connection from DATABASE_URL env var
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    const userId = 419;
    const newPassword = "Test123!";
    
    // Hash the password
    const hashedPassword = await hashPassword(newPassword);
    
    // Update the user's password
    const result = await pool.query(
      'UPDATE users SET password = $1 WHERE id = $2 RETURNING id, username',
      [hashedPassword, userId]
    );
    
    if (result.rows.length > 0) {
      console.log(`Password updated successfully for user ${result.rows[0].username} (${result.rows[0].id})`);
    } else {
      console.log(`User with ID ${userId} not found`);
    }
  } catch (error) {
    console.error('Error updating password:', error);
  } finally {
    await pool.end();
  }
}

setPassword().catch(console.error);
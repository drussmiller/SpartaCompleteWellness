
const fetch = require('node-fetch');

async function deleteWeek2Day0() {
  try {
    // You'll need to be logged in as admin
    const response = await fetch('http://localhost:5000/api/activities/week2-day0', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include'
    });

    const result = await response.json();
    console.log('Result:', result);
  } catch (error) {
    console.error('Error:', error);
  }
}

deleteWeek2Day0();

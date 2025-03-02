/**
 * Breeze API Configuration
 * 
 * This file contains configuration for connecting to the ICICI Direct Breeze API.
 * You should update these values with your own credentials.
 * 
 * To obtain credentials:
 * 1. Go to https://api.icicidirect.com/apiuser/login?api_key=YOUR_API_KEY
 * 2. Replace YOUR_API_KEY with your actual API key
 * 3. Complete the authentication process to get your session key
 */

const BreezeConfig = {
  // Replace these values with your actual credentials
  apiKey: 'YOUR_API_KEY',
  apiSecret: 'YOUR_API_SECRET',
  sessionKey: 'YOUR_SESSION_KEY',
  
  // Default to true for development, set to false in production
  useSimulatedData: true
};

export default BreezeConfig; 
import { config as loadDotenv } from 'dotenv';
import { resolve } from 'path';

// Load the same .env the runtime uses so DATABASE_URL, JWT secrets, etc. are set.
loadDotenv({ path: resolve(__dirname, '../../../.env') });

// Guarantee Google OAuth is treated as unconfigured for the e2e run — tests
// assert that /auth/google returns 501 in this state.
delete process.env.GOOGLE_CLIENT_ID;
delete process.env.GOOGLE_CLIENT_SECRET;

// Speed the refresh test up: we still need iat to differ between two token
// issues in the same test, so keep the second between register and refresh.

/**
 * Vercel Serverless Function Entry Point
 * 
 * This file exports the Express app as a Vercel serverless function.
 * All requests to the backend are handled through this single entry point.
 */

import { app } from '../src/app';

// Export the Express app as the default handler for Vercel serverless
export default app;

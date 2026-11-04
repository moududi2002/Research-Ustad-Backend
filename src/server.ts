import { Server } from 'http';
import mongoose from 'mongoose';
import app from './app';
import config from './app/config';
import seedSuperAdmin from './app/DB';
import { seedPaymentAdmin } from './app/modules/Payment/payment.routes';

let server: Server;

async function main() {
  try {
    // Check if database URL is provided
    if (!config.database_url) {
      console.error('❌ DATABASE_URL is not provided in environment variables');
      process.exit(1);
    }

    // Check if JWT secrets are provided
    if (!config.jwt_access_secret || !config.jwt_refresh_secret) {
      console.error('❌ JWT secrets are not provided in environment variables');
      process.exit(1);
    }

    console.log('🔗 Connecting to database...');
    await mongoose.connect(config.database_url as string);
    console.log('✅ Database connected successfully');

    console.log('🌱 Seeding super admin...');
    await seedSuperAdmin();

    console.log('✅ Super admin seeded');

  
    console.log('🌱 Seeding payment admin...');
    await seedPaymentAdmin();

    console.log('✅ Payment admin seed completed');


    server = app.listen(config.port, () => {
      console.log(`🚀 Server is running on port ${config.port}`);
      console.log(`🌍 Environment: ${config.NODE_ENV}`);
      console.log(`🔗 Frontend URLs: ${config.frontend_urls?.join(', ')}`);
    });
  } catch (err) {
    console.error('❌ Server startup failed:', err);
    process.exit(1);
  }
}

main();

process.on('unhandledRejection', (err) => {
  console.log(`😈 unahandledRejection is detected , shutting down ...`, err);
  if (server) {
    server.close(() => {
      process.exit(1);
    });
  }
  process.exit(1);
});

process.on('uncaughtException', () => {
  console.log(`😈 uncaughtException is detected , shutting down ...`);
  process.exit(1);
});

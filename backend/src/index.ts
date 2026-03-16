import app from './app';
import { env } from './config/env';
import { testConnection, closePool } from './config/database';
import { logger } from './utils/logger';

const server = app.listen(env.PORT, async () => {
  logger.info(`Server starting in ${env.NODE_ENV} mode on port ${env.PORT}`);

  try {
    await testConnection();
    logger.info('All systems operational');
  } catch (error) {
    logger.error('Failed to connect to database on startup', error);
    logger.warn('Server is running but database is not available');
  }
});

// Graceful shutdown
function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  server.close(async () => {
    logger.info('HTTP server closed');

    try {
      await closePool();
      logger.info('Database connections closed');
    } catch (error) {
      logger.error('Error during database cleanup', error);
    }

    logger.info('Graceful shutdown complete');
    process.exit(0);
  });

  // Force shutdown after 30 seconds
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 30000);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled Promise Rejection', reason);
});

process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception', error);
  gracefulShutdown('uncaughtException');
});

export default server;

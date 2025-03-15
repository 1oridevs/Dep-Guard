const Monitor = require('../core/monitors/dependency-monitor');
const NotificationManager = require('../core/managers/notification-manager');

async function monitorCommand(options) {
  const monitor = new Monitor();
  const notifier = new NotificationManager();

  // Start monitoring
  await monitor.start({
    interval: options.interval || '1h',
    onIssueFound: async (issue) => {
      await notifier.notify({
        type: issue.type,
        severity: issue.severity,
        package: issue.package,
        details: issue.details
      });
    }
  });
} 
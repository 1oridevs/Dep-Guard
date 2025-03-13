const ora = require('ora');
const chalk = require('chalk');

class ProgressManager {
  constructor() {
    this.spinner = null;
    this.tasks = new Map();
    this.currentTask = null;
  }

  start(task, message) {
    if (this.spinner) {
      this.spinner.stop();
    }

    this.currentTask = task;
    this.spinner = ora(message).start();
    this.tasks.set(task, {
      status: 'running',
      startTime: Date.now()
    });
  }

  update(message) {
    if (this.spinner) {
      this.spinner.text = message;
    }
  }

  succeed(task, message) {
    const taskInfo = this.tasks.get(task || this.currentTask);
    if (taskInfo) {
      taskInfo.status = 'completed';
      taskInfo.endTime = Date.now();
    }

    if (this.spinner) {
      this.spinner.succeed(message);
      this.spinner = null;
    }
  }

  fail(task, message) {
    const taskInfo = this.tasks.get(task || this.currentTask);
    if (taskInfo) {
      taskInfo.status = 'failed';
      taskInfo.endTime = Date.now();
    }

    if (this.spinner) {
      this.spinner.fail(chalk.red(message));
      this.spinner = null;
    }
  }

  getSummary() {
    const summary = {
      total: this.tasks.size,
      completed: 0,
      failed: 0,
      duration: 0
    };

    for (const [_, task] of this.tasks) {
      if (task.status === 'completed') summary.completed++;
      if (task.status === 'failed') summary.failed++;
      if (task.endTime) {
        summary.duration += task.endTime - task.startTime;
      }
    }

    return summary;
  }
}

module.exports = new ProgressManager(); 
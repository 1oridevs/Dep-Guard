class Issue {
  constructor(type, level, message, dependency = null) {
    this.type = type;       // 'security', 'license', 'policy', etc.
    this.level = level;     // 'high', 'medium', 'low', 'warning'
    this.message = message;
    this.dependency = dependency;
    this.timestamp = new Date();
  }

  isBlocker() {
    return this.level === 'high';
  }

  toJSON() {
    return {
      type: this.type,
      level: this.level,
      message: this.message,
      dependency: this.dependency,
      timestamp: this.timestamp
    };
  }
}

module.exports = Issue; 
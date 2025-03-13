const chalk = require('chalk');

function formatAnalysisReport(analysis) {
  let report = '\nDependency Analysis Report\n';
  report += '=========================\n\n';

  // Summary section
  report += 'Summary:\n';
  report += `Total Dependencies: ${analysis.summary.total}\n`;
  report += `Total Issues: ${analysis.summary.issues}\n`;
  report += `Critical Issues: ${analysis.summary.critical}\n\n`;

  // Dependencies section
  if (analysis.dependencies.length > 0) {
    report += 'Dependency Details:\n\n';
    
    analysis.dependencies.forEach(dep => {
      if (dep.issues.length > 0) {
        report += `${dep.name} (${dep.version}):\n`;
        dep.issues.forEach(issue => {
          const color = issue.level === 'high' ? 'red' : 'yellow';
          report += chalk[color](`  - [${issue.type}] ${issue.message}\n`);
        });
        report += '\n';
      }
    });
  } else {
    report += 'No dependencies found.\n';
  }

  return report;
}

function convertToCSV(data) {
  if (!Array.isArray(data) || !data.length) return '';

  const headers = Object.keys(data[0]);
  const rows = [
    headers.join(','),
    ...data.map(item => headers.map(header => JSON.stringify(item[header] || '')).join(','))
  ];

  return rows.join('\n');
}

function convertToHTML(data) {
  if (!Array.isArray(data) || !data.length) return '';

  const headers = Object.keys(data[0]);
  const rows = data.map(item => headers.map(header => item[header] || ''));

  const html = [
    '<table>',
    '<thead>',
    `<tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>`,
    '</thead>',
    '<tbody>',
    ...rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`),
    '</tbody>',
    '</table>'
  ];

  return html.join('\n');
}

function convertToJUnit(data) {
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<testsuites>',
    `  <testsuite name="dependency-guardian" tests="${data.length}">`,
  ];

  data.forEach(item => {
    const hasIssues = item.issues && item.issues.length > 0;
    xml.push(
      `    <testcase classname="dependencies" name="${item.name}">`,
      hasIssues ? item.issues.map(issue => 
        `      <failure message="${issue.message}" type="${issue.type}"/>`
      ).join('\n') : '',
      '    </testcase>'
    );
  });

  xml.push('  </testsuite>', '</testsuites>');
  return xml.join('\n');
}

module.exports = {
  formatAnalysisReport,
  convertToCSV,
  convertToHTML,
  convertToJUnit
}; 
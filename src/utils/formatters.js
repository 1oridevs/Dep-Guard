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

  return `
    <table>
      <thead>
        <tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr>
      </thead>
      <tbody>
        ${rows.map(row => `<tr>${row.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table>
  `;
}

function convertToJUnit(issues) {
  const testsuites = issues.reduce((acc, issue) => {
    if (!acc[issue.type]) {
      acc[issue.type] = [];
    }
    acc[issue.type].push(issue);
    return acc;
  }, {});

  const xml = ['<?xml version="1.0" encoding="UTF-8"?>'];
  xml.push('<testsuites>');

  Object.entries(testsuites).forEach(([type, typeIssues]) => {
    xml.push(`  <testsuite name="${type}" tests="${typeIssues.length}">`);
    typeIssues.forEach(issue => {
      xml.push(`    <testcase name="${issue.message}">`);
      xml.push(`      <failure message="${issue.message}" type="${issue.level}"/>`);
      xml.push('    </testcase>');
    });
    xml.push('  </testsuite>');
  });

  xml.push('</testsuites>');
  return xml.join('\n');
}

module.exports = {
  convertToCSV,
  convertToHTML,
  convertToJUnit
}; 
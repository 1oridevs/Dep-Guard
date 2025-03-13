function convertToCSV(results) {
  const headers = ['Name', 'Current Version', 'Latest Version', 'Status'];
  const rows = results.map(r => [r.name, r.currentVersion, r.latestVersion, r.status]);
  return [headers, ...rows].map(row => row.join(',')).join('\n');
}

function convertToHTML(results) {
  const rows = results.map(r => `
    <tr>
      <td>${r.name}</td>
      <td>${r.currentVersion}</td>
      <td>${r.latestVersion}</td>
      <td>${r.status}</td>
    </tr>
  `).join('');
  
  return `
    <table>
      <thead>
        <tr>
          <th>Name</th>
          <th>Current Version</th>
          <th>Latest Version</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

module.exports = {
  convertToCSV,
  convertToHTML
}; 
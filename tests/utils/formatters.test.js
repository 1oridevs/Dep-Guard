const { convertToCSV, convertToHTML, convertToJUnit } = require('../../src/utils/formatters');

describe('Formatters', () => {
  const testData = [
    { name: 'test1', version: '1.0.0', status: 'ok' },
    { name: 'test2', version: '2.0.0', status: 'outdated' }
  ];

  describe('convertToCSV', () => {
    it('should convert data to CSV format', () => {
      const csv = convertToCSV(testData);
      const lines = csv.split('\n');
      
      expect(lines[0]).toBe('name,version,status');
      expect(lines[1]).toBe('"test1","1.0.0","ok"');
      expect(lines[2]).toBe('"test2","2.0.0","outdated"');
    });

    it('should handle empty data', () => {
      expect(convertToCSV([])).toBe('');
    });
  });

  describe('convertToHTML', () => {
    it('should convert data to HTML table', () => {
      const html = convertToHTML(testData);
      
      expect(html).toContain('<table>');
      expect(html).toContain('<th>name</th>');
      expect(html).toContain('<td>test1</td>');
      expect(html).toContain('</table>');
    });

    it('should handle empty data', () => {
      expect(convertToHTML([])).toBe('');
    });
  });

  describe('convertToJUnit', () => {
    it('should convert issues to JUnit XML format', () => {
      const issues = [
        { type: 'security', level: 'high', message: 'Vulnerability found' },
        { type: 'license', level: 'warning', message: 'Invalid license' }
      ];

      const xml = convertToJUnit(issues);
      
      expect(xml).toContain('<?xml version="1.0" encoding="UTF-8"?>');
      expect(xml).toContain('<testsuites>');
      expect(xml).toContain('<testsuite name="security"');
      expect(xml).toContain('<testsuite name="license"');
      expect(xml).toContain('</testsuites>');
    });
  });
}); 
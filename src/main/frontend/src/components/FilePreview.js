import React from 'react';
import { Table } from 'react-bootstrap';

const FilePreview = ({ previewData, headers }) => {
  if (!previewData || previewData.length === 0 || !headers || headers.length === 0) {
    return null;
  }

  // Limit the number of columns to display to prevent overflow
  const maxColumns = 8;
  const displayHeaders = headers.slice(0, maxColumns);
  const hasMoreColumns = headers.length > maxColumns;

  return (
    <div className="mt-3 mb-3">
      <h6>File Preview</h6>
      <p className="text-muted small">Showing first {previewData.length} rows of data</p>
      
      <div className="table-responsive">
        <Table size="sm" bordered hover>
          <thead className="bg-light">
            <tr>
              {displayHeaders.map((header, index) => (
                <th key={index}>{header}</th>
              ))}
              {hasMoreColumns && <th>...</th>}
            </tr>
          </thead>
          <tbody>
            {previewData.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.slice(0, maxColumns).map((cell, cellIndex) => (
                  <td key={cellIndex}>{cell}</td>
                ))}
                {hasMoreColumns && <td>...</td>}
              </tr>
            ))}
          </tbody>
        </Table>
      </div>
    </div>
  );
};

export default FilePreview; 
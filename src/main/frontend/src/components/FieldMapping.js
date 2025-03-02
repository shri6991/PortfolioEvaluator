import React from 'react';
import { Form } from 'react-bootstrap';

const FieldMapping = ({ mappedFields, headers, onChange, fileType, disabled }) => {
  if (!mappedFields || !headers || headers.length === 0) {
    return null;
  }

  // Format field name for display (e.g., 'averageCost' -> 'Average Cost')
  const formatFieldName = (fieldName) => {
    return fieldName
      .charAt(0).toUpperCase() 
      + fieldName.slice(1).replace(/([A-Z])/g, ' $1');
  };

  return (
    <>
      {Object.keys(mappedFields).map(field => (
        <Form.Group className="mb-3" key={field}>
          <Form.Label>{formatFieldName(field)}</Form.Label>
          <Form.Select
            value={mappedFields[field]}
            onChange={(e) => onChange(field, e.target.value)}
            disabled={disabled}
          >
            <option value="">-- Select column --</option>
            {headers.map((header, index) => (
              <option key={index} value={header}>
                {header}
              </option>
            ))}
          </Form.Select>
        </Form.Group>
      ))}
    </>
  );
};

export default FieldMapping; 
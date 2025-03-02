import React, { useState, useRef, useEffect } from 'react';
import { Container, Row, Col, Card, Form, Button, Alert, Spinner, Nav, Tab } from 'react-bootstrap';
import { useNavigate } from 'react-router-dom';
import FilePreview from '../components/FilePreview';
import { usePortfolio } from '../context/PortfolioContext';

const ImportPortfolio = () => {
  const navigate = useNavigate();
  const { 
    portfolio, 
    processTransactionsFile, 
    processSummaryFile,
    updateTransactionsFile,
    loading, 
    error 
  } = usePortfolio();
  
  const [file, setFile] = useState(null);
  const [fileType, setFileType] = useState(portfolio ? 'summary' : 'transactions');
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState({ text: '', type: '' });
  const [previewData, setPreviewData] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [portfolioName, setPortfolioName] = useState(portfolio ? portfolio.name : 'My Portfolio');
  const [isUpdate, setIsUpdate] = useState(false);
  const [mappedFields, setMappedFields] = useState({
    transactions: {
      date: '',
      symbol: '',
      action: '',
      quantity: '',
      price: '',
      brokerage: '',
      companyName: ''
    },
    summary: {
      symbol: '',
      companyName: '',
      quantity: '',
      avgCostPrice: '',
      currentPrice: '',
      valueAtCost: '',
      valueAtMarket: '',
      unrealizedPL: '',
      unrealizedPLPercent: ''
    }
  });

  const fileInputRef = useRef(null);
  
  // Set default file type based on portfolio existence
  useEffect(() => {
    if (portfolio) {
      setFileType('summary');
      setPortfolioName(portfolio.name);
      setIsUpdate(true);
    } else {
      setFileType('transactions');
      setIsUpdate(false);
    }
  }, [portfolio]);

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setFile(selectedFile);
      readFilePreview(selectedFile);
    }
  };

  const readFilePreview = (file) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const content = e.target.result;
      const lines = content.split('\n');
      
      if (lines.length > 0) {
        const headerLine = lines[0];
        const headerFields = headerLine.split(',').map(h => h.trim());
        setHeaders(headerFields);
        
        // Get up to 5 rows for preview
        const previewRows = [];
        for (let i = 1; i < Math.min(lines.length, 6); i++) {
          const line = lines[i].trim();
          if (line) {
            const values = line.split(',').map(v => v.trim());
            previewRows.push(values);
          }
        }
        setPreviewData(previewRows);
      }
    };
    reader.readAsText(file);
  };

  const handleFieldMapping = (fileType, field, headerName) => {
    setMappedFields(prev => ({
      ...prev,
      [fileType]: {
        ...prev[fileType],
        [field]: headerName
      }
    }));
  };

  const handleFileTypeChange = (type) => {
    setFileType(type);
  };

  const handleSubmit = async (e) => {
    e.preventDefault(); // Prevent default form submission
    
    if (!file) {
      alert('Please select a file to upload');
      return;
    }
    
    // Check if required fields are mapped
    const currentMapping = mappedFields[fileType];
    const requiredFields = fileType === 'transactions' 
      ? ['date', 'symbol', 'action', 'quantity', 'price']
      : ['symbol', 'quantity', 'avgCostPrice', 'currentPrice'];
    
    const missingFields = requiredFields.filter(field => !currentMapping[field]);
    
    if (missingFields.length > 0) {
      alert(`Please map the following required fields: ${missingFields.join(', ')}`);
      return;
    }
    
    try {
      let result;
      
      if (fileType === 'transactions') {
        if (isUpdate) {
          result = await updateTransactionsFile(file, headers, currentMapping);
        } else {
          result = await processTransactionsFile(file, headers, currentMapping, portfolioName);
        }
      } else if (fileType === 'summary') {
        result = await processSummaryFile(file, headers, currentMapping, portfolioName);
      }
      
      if (result) {
        navigate('/dashboard');
      }
    } catch (error) {
      console.error('Error uploading file:', error);
    }
  };

  const downloadSampleCSV = () => {
    let csvContent = '';
    
    if (fileType === 'transactions') {
      csvContent = 'Date,Symbol,Action,Quantity,Price,Brokerage,Company Name\n' +
        '2023-01-15,AAPL,BUY,10,175.25,5.99,Apple Inc.\n' +
        '2023-02-20,MSFT,BUY,5,280.50,5.99,Microsoft Corporation\n' +
        '2023-03-10,AAPL,SELL,3,180.75,5.99,Apple Inc.\n' +
        '2023-04-05,GOOGL,BUY,2,2750.00,7.99,Alphabet Inc.\n' +
        '2023-05-12,AMZN,BUY,8,135.75,5.99,Amazon.com Inc.';
    } else {
      csvContent = 'Symbol,Company Name,Quantity,Avg Cost Price,Current Price,Value at Cost,Value at Market,Unrealized P/L,Unrealized P/L %\n' +
        'AAPL,Apple Inc.,25,150.25,180.50,3756.25,4512.50,756.25,20.13\n' +
        'MSFT,Microsoft Corporation,15,250.75,300.25,3761.25,4503.75,742.50,19.74\n' +
        'GOOGL,Alphabet Inc.,5,2500.00,2800.00,12500.00,14000.00,1500.00,12.00\n' +
        'AMZN,Amazon.com Inc.,20,120.50,150.25,2410.00,3005.00,595.00,24.69';
    }
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileType === 'transactions' ? 'sample_transactions.csv' : 'sample_portfolio_summary.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderFieldMappingForm = () => {
    const currentMapping = mappedFields[fileType];
    const fields = Object.keys(currentMapping);
    
    return (
      <Card className="mb-4">
        <Card.Header>Map File Columns</Card.Header>
        <Card.Body>
          <p className="text-muted mb-3">
            Match your file columns to the required fields. Required fields are marked with *.
          </p>
          
          <Row>
            {fields.map(field => (
              <Col md={6} key={field} className="mb-3">
                <Form.Group>
                  <Form.Label>
                    {field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, ' $1')}
                    {(fileType === 'transactions' && ['date', 'symbol', 'action', 'quantity', 'price'].includes(field)) ||
                     (fileType === 'summary' && ['symbol', 'quantity', 'avgCostPrice', 'currentPrice'].includes(field)) 
                      ? ' *' : ''}
                  </Form.Label>
                  <Form.Select 
                    value={currentMapping[field]} 
                    onChange={(e) => handleFieldMapping(fileType, field, e.target.value)}
                  >
                    <option value="">-- Select Column --</option>
                    {headers.map((header, index) => (
                      <option key={index} value={header}>{header}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              </Col>
            ))}
          </Row>
        </Card.Body>
      </Card>
    );
  };

  return (
    <Container className="mt-4">
      <h1 className="mb-4">
        {isUpdate ? 'Update Portfolio Data' : 'Import Portfolio Data'}
      </h1>
      
      {message.text && (
        <Alert variant={message.type}>
          {message.text}
          {message.type === 'success' && (
            <div className="mt-2">
              <Button variant="primary" onClick={() => navigate('/dashboard')}>
                View Portfolio
              </Button>
            </div>
          )}
        </Alert>
      )}
      
      {portfolio && (
        <Alert variant="info" className="mb-4">
          <Alert.Heading>Portfolio Already Exists</Alert.Heading>
          <p>
            You already have a portfolio loaded. Choose an option below to update it:
          </p>
          <div className="d-flex mt-3">
            <Button 
              variant={fileType === 'transactions' ? 'primary' : 'outline-primary'} 
              className="me-2"
              onClick={() => setFileType('transactions')}
            >
              Update Transactions
            </Button>
            <Button 
              variant={fileType === 'summary' ? 'primary' : 'outline-primary'}
              onClick={() => setFileType('summary')}
            >
              Update Market Values
            </Button>
          </div>
        </Alert>
      )}
      
      <Row>
        <Col lg={6} className="mb-4">
          <Card>
            <Card.Body>
              <Card.Title>{isUpdate ? 'Update Portfolio' : 'Upload Portfolio File'}</Card.Title>
              <Card.Text>
                {isUpdate 
                  ? `Update your ${fileType === 'transactions' ? 'transactions' : 'market values'} for ${portfolio?.name || 'your portfolio'}.`
                  : 'Import your portfolio data from a CSV file.'}
              </Card.Text>
              
              <Form onSubmit={handleSubmit}>
                <Form.Group className="mb-3">
                  <Form.Label>Portfolio Name</Form.Label>
                  <Form.Control
                    type="text"
                    value={portfolioName}
                    onChange={(e) => setPortfolioName(e.target.value)}
                    disabled={loading}
                    placeholder="Enter a name for your portfolio"
                  />
                </Form.Group>
                
                <Form.Group className="mb-3">
                  <Form.Label>File Type</Form.Label>
                  <Form.Select 
                    value={fileType} 
                    onChange={(e) => setFileType(e.target.value)}
                    disabled={loading || (portfolio && fileType === 'summary')}
                  >
                    {(!portfolio || (portfolio && isUpdate)) && <option value="transactions">Transactions File</option>}
                    <option value="summary">Portfolio Summary File</option>
                  </Form.Select>
                  <Form.Text className="text-muted">
                    {fileType === 'transactions' 
                      ? 'Upload a CSV file with your buy/sell transactions. We will calculate current prices using simulated data.'
                      : 'Upload a CSV file with your current portfolio holdings and their market values.'}
                  </Form.Text>
                </Form.Group>
                
                <Form.Group className="mb-3">
                  <Form.Label>Choose File</Form.Label>
                  <div className="d-flex">
                    <Form.Control 
                      type="file" 
                      accept=".csv" 
                      onChange={handleFileChange}
                      ref={fileInputRef}
                      disabled={loading}
                    />
                    <Button 
                      variant="outline-secondary" 
                      onClick={downloadSampleCSV}
                      className="ms-2"
                      disabled={loading}
                    >
                      Download Sample
                    </Button>
                  </div>
                  
                  {file && (
                    <div className="mt-2 mb-3">
                      <p><strong>Selected file:</strong> {file.name}</p>
                    </div>
                  )}
                  
                  <FilePreview previewData={previewData} headers={headers} />
                </Form.Group>
                
                {previewData.length > 0 && renderFieldMappingForm()}
                
                <Button 
                  variant="primary" 
                  type="submit" 
                  disabled={!file || loading}
                >
                  {loading ? (
                    <>
                      <Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="me-2" />
                      Processing...
                    </>
                  ) : isUpdate ? 'Update Portfolio' : 'Upload Portfolio'}
                </Button>
              </Form>
            </Card.Body>
          </Card>
        </Col>
        
        <Col lg={6}>
          <Card>
            <Card.Body>
              <Card.Title>File Format Guidelines</Card.Title>
              
              <Tab.Container defaultActiveKey={fileType}>
                <Nav variant="tabs" className="mb-3">
                  <Nav.Item>
                    <Nav.Link eventKey="transactions">Transactions File</Nav.Link>
                  </Nav.Item>
                  <Nav.Item>
                    <Nav.Link eventKey="summary">Summary File</Nav.Link>
                  </Nav.Item>
                </Nav>
                
                <Tab.Content>
                  <Tab.Pane eventKey="transactions">
                    <div className="mt-3">
                      <h5>Transaction File Format</h5>
                      <p>Your transaction file should contain the following information:</p>
                      
                      <ul>
                        <li><strong>Date:</strong> Date of transaction (YYYY-MM-DD format)</li>
                        <li><strong>Symbol:</strong> The ticker symbol of the security</li>
                        <li><strong>Action:</strong> BUY or SELL</li>
                        <li><strong>Quantity:</strong> Number of shares</li>
                        <li><strong>Price:</strong> Price per share in ₹</li>
                        <li><strong>Brokerage:</strong> Any transaction fees in ₹ (optional)</li>
                        <li><strong>Company Name:</strong> The full name of the company (optional)</li>
                      </ul>
                    </div>
                  </Tab.Pane>
                  
                  <Tab.Pane eventKey="summary">
                    <div className="mt-3">
                      <h5>Summary File Format</h5>
                      <p>Your portfolio summary file should contain the following information:</p>
                      
                      <ul>
                        <li><strong>Symbol:</strong> The ticker symbol of the security</li>
                        <li><strong>Company Name:</strong> The full name of the company (optional)</li>
                        <li><strong>Quantity:</strong> Number of shares held</li>
                        <li><strong>Avg Cost Price:</strong> Average cost of acquisition per share in ₹</li>
                        <li><strong>Current Price:</strong> Current market price per share in ₹</li>
                        <li><strong>Value at Cost:</strong> Total cost of acquisition in ₹ (optional)</li>
                        <li><strong>Value at Market:</strong> Current market value in ₹ (optional)</li>
                        <li><strong>Unrealized P/L:</strong> Unrealized profit/loss in ₹ (optional)</li>
                        <li><strong>Unrealized P/L %:</strong> Unrealized profit/loss percentage (optional)</li>
                      </ul>
                    </div>
                  </Tab.Pane>
                </Tab.Content>
              </Tab.Container>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default ImportPortfolio; 
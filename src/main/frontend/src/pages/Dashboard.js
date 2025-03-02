import React from 'react';
import { Container, Row, Col, Card, Button, ListGroup, Alert } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { usePortfolio } from '../context/PortfolioContext';

// Helper function to safely format currency
const formatCurrency = (value) => {
  if (value === undefined || value === null) return '₹0.00';
  return '₹' + value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

// Helper function to safely format percentage
const formatPercentage = (value) => {
  if (value === undefined || value === null) return '0.00%';
  return value.toFixed(2) + '%';
};

const Dashboard = () => {
  const { portfolio, showSummaryPrompt, dismissSummaryPrompt } = usePortfolio();

  // Sort holdings by market value (descending)
  const getTopHoldings = () => {
    if (!portfolio || !portfolio.holdings || portfolio.holdings.length === 0) {
      return [];
    }
    
    return [...portfolio.holdings]
      .sort((a, b) => (b.currentValue || 0) - (a.currentValue || 0))
      .slice(0, 5);
  };

  return (
    <Container>
      <h1 className="mb-4">Portfolio Evaluator Dashboard</h1>
      
      {showSummaryPrompt && (
        <Alert variant="info" dismissible onClose={dismissSummaryPrompt}>
          <Alert.Heading>Transaction File Uploaded Successfully!</Alert.Heading>
          <p>
            Would you like to also upload a summary file with current market values?
            This will provide more accurate valuation of your portfolio.
          </p>
          <hr />
          <div className="d-flex justify-content-end">
            <Button variant="outline-secondary" className="me-2" onClick={dismissSummaryPrompt}>
              No, Continue
            </Button>
            <Link to="/import" className="btn btn-primary">
              Upload Summary File
            </Link>
          </div>
        </Alert>
      )}
      
      {portfolio ? (
        // Show portfolio summary if a portfolio exists
        <Row className="mb-4">
          <Col>
            <Card className="shadow-sm">
              <Card.Header as="h5">
                {portfolio.name}
                <span className="badge bg-secondary ms-2">{portfolio.type}</span>
              </Card.Header>
              <Card.Body>
                <Row>
                  <Col md={6}>
                    <div className="mb-3">
                      <h6>Total Value</h6>
                      <h3>{formatCurrency(portfolio.totalValue)}</h3>
                    </div>
                    <div className="mb-3">
                      <h6>Invested Value</h6>
                      <h3>{formatCurrency(portfolio.investedValue)}</h3>
                    </div>
                  </Col>
                  <Col md={6}>
                    <div className="mb-3">
                      <h6>Unrealized Return</h6>
                      <h3 className={portfolio.unrealizedReturn >= 0 ? 'text-success' : 'text-danger'}>
                        {formatPercentage(portfolio.unrealizedReturn)}
                      </h3>
                    </div>
                    <div className="mb-3">
                      <h6>Last Updated</h6>
                      <p>{portfolio.lastUpdated ? new Date(portfolio.lastUpdated).toLocaleString() : 'N/A'}</p>
                    </div>
                  </Col>
                </Row>
                <div className="d-grid gap-2 d-md-flex justify-content-md-end">
                  <Link to="/portfolio" className="btn btn-primary">
                    View Details
                  </Link>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      ) : (
        // Show options to import a portfolio if none exists
        <Row className="mb-4">
          <Col md={4} className="mb-4">
            <Card className="h-100 shadow-sm">
              <Card.Body className="d-flex flex-column">
                <Card.Title>Import Portfolio</Card.Title>
                <Card.Text>
                  Upload your transactions file to analyze your portfolio performance.
                </Card.Text>
                <div className="mt-auto">
                  <Link to="/import" className="btn btn-primary">
                    Import Now
                  </Link>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}
      
      {!portfolio && (
        <Row className="mb-4">
          <Col>
            <Card className="shadow-sm">
              <Card.Header as="h5">Getting Started</Card.Header>
              <Card.Body>
                <p>Follow these steps to analyze your portfolio:</p>
                <ListGroup variant="flush" numbered>
                  <ListGroup.Item>Prepare a CSV file with your transactions or portfolio summary</ListGroup.Item>
                  <ListGroup.Item>Go to the Import Portfolio page</ListGroup.Item>
                  <ListGroup.Item>Upload your file and map the columns</ListGroup.Item>
                  <ListGroup.Item>View your portfolio analysis</ListGroup.Item>
                </ListGroup>
              </Card.Body>
            </Card>
          </Col>
        </Row>
      )}
      
      {portfolio && portfolio.holdings && portfolio.holdings.length > 0 && (
        <Row className="mb-4">
          <Col>
            <Card className="shadow-sm">
              <Card.Header as="h5">Top Holdings (by Market Value)</Card.Header>
              <Card.Body className="p-0">
                <ListGroup variant="flush">
                  {getTopHoldings().map((holding, index) => (
                    <ListGroup.Item key={index} className="d-flex justify-content-between align-items-center">
                      <div>
                        <strong>{holding.symbol}</strong> - {holding.name || holding.symbol}
                      </div>
                      <div>
                        <span className="me-3">{formatCurrency(holding.currentValue)}</span>
                        <span className={holding.unrealizedPLPercent >= 0 ? 'text-success' : 'text-danger'}>
                          {formatPercentage(holding.unrealizedPLPercent)}
                          {holding.unrealizedPLPercent >= 0 ? ' ▲' : ' ▼'}
                        </span>
                      </div>
                    </ListGroup.Item>
                  ))}
                </ListGroup>
              </Card.Body>
              <Card.Footer className="text-end">
                <Link to="/portfolio" className="btn btn-sm btn-outline-primary">
                  View All Holdings
                </Link>
              </Card.Footer>
            </Card>
          </Col>
        </Row>
      )}
    </Container>
  );
};

export default Dashboard; 
import React, { useState, useEffect } from 'react';
import { Container, Row, Col, Card, Table, Badge, Button } from 'react-bootstrap';
import { Link } from 'react-router-dom';

const PortfolioList = () => {
  const [portfolios, setPortfolios] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    // For demonstration purposes, we'll use mock data
    const mockPortfolios = [
      {
        id: 1,
        name: 'Primary Investment Portfolio',
        type: 'Equity',
        totalValue: 1245000.75,
        unrealizedReturn: 12.5,
        lastUpdated: '2025-02-28',
        securities: 12
      },
      {
        id: 2,
        name: 'Retirement Fund',
        type: 'Mixed',
        totalValue: 875620.50,
        unrealizedReturn: 8.2,
        lastUpdated: '2025-03-01',
        securities: 8
      }
    ];
    
    // Simulate API call
    setTimeout(() => {
      setPortfolios(mockPortfolios);
      setLoading(false);
    }, 1000);
    
    // In a real app, this would be an API call:
    // fetch('/api/portfolios')
    //   .then(response => response.json())
    //   .then(data => {
    //     setPortfolios(data);
    //     setLoading(false);
    //   })
    //   .catch(err => {
    //     setError('Failed to load portfolios. Please try again later.');
    //     setLoading(false);
    //   });
  }, []);

  const getReturnClass = (returnValue) => {
    if (returnValue > 0) return 'text-success';
    if (returnValue < 0) return 'text-danger';
    return 'text-muted';
  };

  return (
    <Container>
      <Row className="mb-4 align-items-center">
        <Col>
          <h1>Your Portfolios</h1>
        </Col>
        <Col md="auto">
          <Button as={Link} to="/import" variant="success">
            <i className="bi bi-plus-circle me-2"></i>
            Import New Portfolio
          </Button>
        </Col>
      </Row>

      {error && (
        <Row>
          <Col>
            <div className="alert alert-danger" role="alert">
              {error}
            </div>
          </Col>
        </Row>
      )}

      {loading ? (
        <div className="text-center py-5">
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-3">Loading your portfolios...</p>
        </div>
      ) : portfolios.length === 0 ? (
        <Card className="text-center p-5">
          <Card.Body>
            <h3>No Portfolios Found</h3>
            <p className="text-muted mb-4">
              You haven't imported any portfolios yet. Import your first portfolio to get started.
            </p>
            <Button as={Link} to="/import" variant="primary">
              Import Portfolio
            </Button>
          </Card.Body>
        </Card>
      ) : (
        <Row>
          <Col>
            <div className="table-responsive">
              <Table hover className="align-middle">
                <thead>
                  <tr>
                    <th>Portfolio Name</th>
                    <th>Type</th>
                    <th>Securities</th>
                    <th>Total Value</th>
                    <th>Unrealized Return</th>
                    <th>Last Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {portfolios.map(portfolio => (
                    <tr key={portfolio.id}>
                      <td>
                        <Link to={`/portfolios/${portfolio.id}`} className="text-decoration-none">
                          {portfolio.name}
                        </Link>
                      </td>
                      <td>
                        <Badge bg={portfolio.type === 'Equity' ? 'primary' : 'info'}>
                          {portfolio.type}
                        </Badge>
                      </td>
                      <td>{portfolio.securities}</td>
                      <td>₹{portfolio.totalValue.toLocaleString('en-IN')}</td>
                      <td className={getReturnClass(portfolio.unrealizedReturn)}>
                        {portfolio.unrealizedReturn > 0 ? '+' : ''}
                        {portfolio.unrealizedReturn.toFixed(2)}%
                      </td>
                      <td>{new Date(portfolio.lastUpdated).toLocaleDateString()}</td>
                      <td>
                        <Button as={Link} to={`/portfolios/${portfolio.id}`} variant="outline-primary" size="sm">
                          View
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          </Col>
        </Row>
      )}
    </Container>
  );
};

export default PortfolioList; 
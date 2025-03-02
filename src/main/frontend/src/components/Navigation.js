import React from 'react';
import { Navbar, Nav, Container } from 'react-bootstrap';
import { NavLink } from 'react-router-dom';
import { usePortfolio } from '../context/PortfolioContext';

const Navigation = () => {
  const { portfolio, clearPortfolio } = usePortfolio();

  return (
    <Navbar bg="dark" variant="dark" expand="lg">
      <Container>
        <Navbar.Brand as={NavLink} to="/">Portfolio Evaluator</Navbar.Brand>
        <Navbar.Toggle aria-controls="basic-navbar-nav" />
        <Navbar.Collapse id="basic-navbar-nav">
          <Nav className="me-auto">
            <Nav.Link as={NavLink} to="/" end>Dashboard</Nav.Link>
            <Nav.Link as={NavLink} to="/import">Import Portfolio</Nav.Link>
            {portfolio && (
              <Nav.Link as={NavLink} to="/portfolio">View Portfolio</Nav.Link>
            )}
          </Nav>
          {portfolio && (
            <Nav>
              <Nav.Link onClick={clearPortfolio} className="text-danger">
                Clear Portfolio
              </Nav.Link>
            </Nav>
          )}
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
};

export default Navigation; 
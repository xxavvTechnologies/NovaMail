require('dotenv').config();
const express = require('express');
const { auth } = require('express-openid-connect');
const path = require('path');

const app = express();

const config = {
  authRequired: false,
  auth0Logout: true,
  secret: process.env.AUTH0_SECRET,
  baseURL: process.env.AUTH0_BASE_URL,
  clientID: process.env.AUTH0_CLIENT_ID,
  issuerBaseURL: process.env.AUTH0_ISSUER_BASE_URL
};

app.use(auth(config));
app.use(express.static('public'));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/api/user', (req, res) => {
  res.json(req.oidc.user);
});

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
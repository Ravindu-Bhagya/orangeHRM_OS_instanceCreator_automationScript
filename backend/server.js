const express = require('express');
const cors = require('cors');
const path = require('path');
const instanceRoutes = require('./routes/instanceRoutes');

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../frontend')));
app.use('/api', instanceRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Network access:  http://192.168.101.111:${PORT}`);
});

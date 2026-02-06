const express = require('express');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const cors = require('cors'); // ← LINHA ADICIONADA

const app = express();
app.use(express.json());
app.use(cors()); // ← LINHA ADICIONADA
app.use(express.static('.'));

// ROTA PRINCIPAL: Sua API de consulta
app.post('/consultar', async (req, res) => {
  try {
    const { placa, renavam } = req.body;
    
    // 1. Usa o token QUE JÁ FUNCIONA
    const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyZW5hdmFtIjoiMDA0Njc4ODA0NzYiLCJwbGF0ZSI6Ik5SUzVKNDciLCJpYXQiOjE3NzAzMzIwMzR9.QmpzZTRGYiTxapKcyIzd8eZxooEGtQM3sAsMevX125c';

    // 2. Consulta a API externa (etapa 1)
    const resposta1 = await axios.post(
      'https://detranmatogrossosul-govbr.vercel.app/api/scrape5',
      { renavam, plate: placa },
      { headers: { Authorization: token } }
    );

    const userId = resposta1.data.userId;

    // 3. Busca os dados completos (etapa 2)
    const resposta2 = await axios.get(
      `https://detranmatogrossosul-govbr.vercel.app/veiculo/${userId}`
    );

    // 4. Retorna os dados HTML
    res.send(resposta2.data);

  } catch (error) {
    res.status(500).send('Erro: ' + error.message);
  }
});

// Inicia o servidor
app.listen(3000, () => {
  console.log('✅ Servidor rodando em: http://localhost:3000');
  console.log('📌 Frontend disponível em: http://localhost:3000/index.html');
});
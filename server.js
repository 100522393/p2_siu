const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

io.on('connection', (socket) => {
    // Escuchar comandos del Sensor y reenviar al Visualizador
    socket.on('guiño-derecho', () => socket.broadcast.emit('avanzar-pagina'));
    socket.on('guiño-izquierdo', () => socket.broadcast.emit('retroceder-pagina'));
    socket.on('comando-salir', () => socket.broadcast.emit('ir-inicio'));
    socket.on('comando-zoom', (nivel) => socket.broadcast.emit('hacer-zoom', nivel));
    socket.on('mover-selector', (direccion) => socket.broadcast.emit('navegar-menu', direccion));
});

server.listen(3000, () => console.log('Servidor en http://localhost:3000'));
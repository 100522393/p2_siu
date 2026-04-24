const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'src')));

// Gestiona cada cliente conectado y registra los comandos que se comparten por Socket.IO.
io.on('connection', (socket) => {
    // Escuchar comandos del Sensor y reenviar al Visualizador

    // Reenvia al visualizador la orden de avanzar cuando el sensor detecta un guiño derecho.
    socket.on('guiño-derecho', () => socket.broadcast.emit('avanzar-pagina'));

    // Reenvia al visualizador la orden de retroceder cuando el sensor detecta un guiño izquierdo.
    socket.on('guiño-izquierdo', () => socket.broadcast.emit('retroceder-pagina'));

    // Reenvia la orden de volver al inicio cuando el sensor o la voz solicitan salir.
    socket.on('comando-salir', () => socket.broadcast.emit('ir-inicio'));

    // Sincroniza el nivel de zoom calculado por el sensor con el visualizador.
    socket.on('comando-zoom', (nivel) => socket.broadcast.emit('hacer-zoom', nivel));

    // Mueve la seleccion del menu en otros dispositivos segun la direccion detectada.
    socket.on('mover-selector', (direccion) => socket.broadcast.emit('navegar-menu', direccion));
});

// Arranca el servidor web y deja disponible la aplicacion en el puerto local indicado.
server.listen(3000, () => console.log('Servidor en http://localhost:3000'));

const socket = io();

const video = document.getElementById("webcam");
const canvas = document.getElementById("overlay");
const ctx = canvas.getContext("2d");
const statusPanel = document.getElementById("status");
const devToggle = document.getElementById("devToggle");

const COOLDOWN_MS = 600;
const EYE_CLOSED_THRESHOLD = 0.014;
const NOSE_OFFSET_THRESHOLD = 0.035;
const ZOOM_THRESHOLD = 0.26;
const EYES_CLOSED_EXIT_MS = 650;
const SINGLE_WINK_MS = 140;

let devMode = false;
let cooldown = false;
let estadoNariz = "centro";
let tiempoInicioOjosCerrados = null;
let tiempoInicioGUIÑOIzq = null;
let tiempoInicioGUIÑODer = null;

// Muestra mensajes de estado y ayuda en el panel del sensor.
function setStatus(message) {
    statusPanel.textContent = message;
}

// Ajusta el canvas de depuracion al tamaño real del video de la webcam.
function syncCanvasSize() {
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
}

// Limpia las marcas y lineas dibujadas sobre el video.
function clearOverlay() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Bloquea temporalmente nuevos gestos para evitar envios repetidos por una misma accion.
function triggerCooldown() {
    cooldown = true;
    // Desactiva el bloqueo pasado el tiempo de espera configurado.
    window.setTimeout(() => {
        cooldown = false;
    }, COOLDOWN_MS);
}

// Dibuja un punto de depuracion en una posicion del canvas.
function drawPoint(x, y, color = "#57ff72", radius = 2) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
}

// Dibuja una linea de depuracion entre dos puntos del canvas.
function drawLine(x1, y1, x2, y2, color = "#ffd24a", width = 2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
}

// Escribe texto de depuracion sobre el canvas del sensor.
function drawText(text, x, y, color = "#ffffff") {
    ctx.fillStyle = color;
    ctx.font = "14px monospace";
    ctx.fillText(text, x, y);
}

// Calcula si la nariz esta centrada o desplazada respecto al centro de los ojos.
function getEstadoNarizSegunCara(marks) {
    const noseX = marks[1].x;
    const leftEyeX = marks[33].x;
    const rightEyeX = marks[263].x;
    const eyeCenterX = (leftEyeX + rightEyeX) / 2;
    const noseOffset = noseX - eyeCenterX;

    if (noseOffset < -NOSE_OFFSET_THRESHOLD) {
        return { estado: "derecha", noseX, eyeCenterX, noseOffset };
    }

    if (noseOffset > NOSE_OFFSET_THRESHOLD) {
        return { estado: "izquierda", noseX, eyeCenterX, noseOffset };
    }

    return { estado: "centro", noseX, eyeCenterX, noseOffset };
}

// Dibuja las marcas faciales y metricas utiles cuando esta activado el modo desarrollador.
function drawDebug(marks, metrics) {
    if (!devMode) {
        clearOverlay();
        return;
    }

    clearOverlay();

    // Pinta cada punto facial detectado por MediaPipe sobre el video.
    marks.forEach((point) => {
        drawPoint(point.x * canvas.width, point.y * canvas.height, "#57ff72", 1.8);
    });

    const nose = marks[1];
    const leftTop = marks[386];
    const leftBottom = marks[374];
    const rightTop = marks[159];
    const rightBottom = marks[145];

    const nosePx = nose.x * canvas.width;
    const nosePy = nose.y * canvas.height;
    const eyeCenterPx = metrics.eyeCenterX * canvas.width;

    drawPoint(nosePx, nosePy, "#ff5858", 5);
    drawLine(eyeCenterPx, 0, eyeCenterPx, canvas.height, "#ffd24a", 2);
    drawLine(
        leftTop.x * canvas.width,
        leftTop.y * canvas.height,
        leftBottom.x * canvas.width,
        leftBottom.y * canvas.height,
        metrics.dIzq < EYE_CLOSED_THRESHOLD ? "#ff5858" : "#57ff72",
        3
    );
    drawLine(
        rightTop.x * canvas.width,
        rightTop.y * canvas.height,
        rightBottom.x * canvas.width,
        rightBottom.y * canvas.height,
        metrics.dDer < EYE_CLOSED_THRESHOLD ? "#ff5858" : "#57ff72",
        3
    );

    drawText(`Estado nariz: ${metrics.estadoActualNariz}`, 10, 24, "#ffd24a");
    drawText(`Offset nariz: ${metrics.noseOffset.toFixed(4)}`, 10, 46, "#ff80d5");
    drawText(`Ojo izq: ${metrics.dIzq.toFixed(4)}`, 10, 68);
    drawText(`Ojo der: ${metrics.dDer.toFixed(4)}`, 10, 90);
    drawText(`Zoom: ${metrics.eyeDist.toFixed(4)}`, 10, 112);
    drawText(`Cooldown: ${cooldown ? "ON" : "OFF"}`, 10, 134, cooldown ? "#ff5858" : "#57ff72");
}

// Actualiza el panel textual con las metricas actuales de ojos, nariz y cooldown.
function actualizarEstadoTexto(metrics) {
    setStatus(
        `Modo dev: ${devMode}\n` +
        `Estado nariz: ${metrics.estadoActualNariz}\n` +
        `Offset nariz-cara: ${metrics.noseOffset.toFixed(4)}\n` +
        `Ojo izq: ${metrics.dIzq.toFixed(4)}\n` +
        `Ojo der: ${metrics.dDer.toFixed(4)}\n` +
        `Tiempo ambos: ${metrics.tiempoCierreActual} ms\n` +
        `Tiempo guiño izq: ${metrics.tiempoGUIÑOIzqActual} ms\n` +
        `Tiempo guiño der: ${metrics.tiempoGUIÑODerActual} ms\n` +
        `Cooldown: ${cooldown ? "ON" : "OFF"}`
    );
}

// Convierte las metricas de la cara en comandos Socket.IO para controlar el visualizador.
function procesarGestos(metrics) {
    if (cooldown) {
        return;
    }

    if (metrics.ambosCerrados && metrics.tiempoCierreActual >= EYES_CLOSED_EXIT_MS) {
        socket.emit("comando-salir");
        tiempoInicioOjosCerrados = null;
        tiempoInicioGUIÑOIzq = null;
        tiempoInicioGUIÑODer = null;
        triggerCooldown();
        return;
    }

    if (metrics.soloDerCerrado && metrics.tiempoGUIÑODerActual >= SINGLE_WINK_MS) {
        socket.emit("guiño-derecho");
        tiempoInicioGUIÑODer = null;
        triggerCooldown();
        return;
    }

    if (metrics.soloIzqCerrado && metrics.tiempoGUIÑOIzqActual >= SINGLE_WINK_MS) {
        socket.emit("guiño-izquierdo");
        tiempoInicioGUIÑOIzq = null;
        triggerCooldown();
        return;
    }

    if (metrics.estadoActualNariz !== estadoNariz) {
        if (metrics.estadoActualNariz === "izquierda") {
            socket.emit("mover-selector", "izquierda");
            triggerCooldown();
        } else if (metrics.estadoActualNariz === "derecha") {
            socket.emit("mover-selector", "derecha");
            triggerCooldown();
        }

        estadoNariz = metrics.estadoActualNariz;
    }

    socket.emit("comando-zoom", metrics.eyeDist > ZOOM_THRESHOLD ? 1.5 : 1.0);
}

// Extrae distancias y tiempos de cierre de ojos a partir de los landmarks faciales.
function construirMetricas(marks) {
    const dIzq = Math.abs(marks[386].y - marks[374].y);
    const dDer = Math.abs(marks[159].y - marks[145].y);

    const ojoIzqCerrado = dIzq < EYE_CLOSED_THRESHOLD;
    const ojoDerCerrado = dDer < EYE_CLOSED_THRESHOLD;
    const ambosCerrados = ojoIzqCerrado && ojoDerCerrado;
    const soloIzqCerrado = ojoIzqCerrado && !ojoDerCerrado;
    const soloDerCerrado = ojoDerCerrado && !ojoIzqCerrado;

    const infoNariz = getEstadoNarizSegunCara(marks);
    const eyeDist = Math.abs(marks[33].x - marks[263].x);

    let tiempoCierreActual = 0;
    let tiempoGUIÑOIzqActual = 0;
    let tiempoGUIÑODerActual = 0;

    if (ambosCerrados) {
        if (tiempoInicioOjosCerrados === null) {
            tiempoInicioOjosCerrados = Date.now();
        }
        tiempoCierreActual = Date.now() - tiempoInicioOjosCerrados;
        tiempoInicioGUIÑOIzq = null;
        tiempoInicioGUIÑODer = null;
    } else {
        tiempoInicioOjosCerrados = null;
    }

    if (soloIzqCerrado) {
        if (tiempoInicioGUIÑOIzq === null) {
            tiempoInicioGUIÑOIzq = Date.now();
        }
        tiempoGUIÑOIzqActual = Date.now() - tiempoInicioGUIÑOIzq;
    } else {
        tiempoInicioGUIÑOIzq = null;
    }

    if (soloDerCerrado) {
        if (tiempoInicioGUIÑODer === null) {
            tiempoInicioGUIÑODer = Date.now();
        }
        tiempoGUIÑODerActual = Date.now() - tiempoInicioGUIÑODer;
    } else {
        tiempoInicioGUIÑODer = null;
    }

    return {
        dIzq,
        dDer,
        ambosCerrados,
        soloIzqCerrado,
        soloDerCerrado,
        eyeDist,
        tiempoCierreActual,
        tiempoGUIÑOIzqActual,
        tiempoGUIÑODerActual,
        ...infoNariz,
        estadoActualNariz: infoNariz.estado
    };
}

// Reinicia el estado del sensor cuando no se detecta una cara valida.
function resetDeteccion() {
    estadoNariz = "centro";
    tiempoInicioOjosCerrados = null;
    tiempoInicioGUIÑOIzq = null;
    tiempoInicioGUIÑODer = null;
    clearOverlay();
    setStatus("No se detecta ninguna cara.\nComprueba luz, encuadre y distancia a la camara.");
}

// Inicializa MediaPipe FaceMesh, la webcam y el bucle de deteccion de gestos.
async function iniciarSensor() {
    if (!window.FaceMesh || !window.Camera) {
        setStatus("No se han podido cargar las librerias de MediaPipe.");
        return;
    }

    setStatus("Inicializando sensor...");

    const faceMesh = new FaceMesh({
        // Indica a MediaPipe desde donde cargar los archivos necesarios de FaceMesh.
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });

    faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    // Procesa cada resultado de FaceMesh, actualizando depuracion y emitiendo gestos.
    faceMesh.onResults((results) => {
        syncCanvasSize();

        if (!results.multiFaceLandmarks || results.multiFaceLandmarks.length === 0) {
            resetDeteccion();
            return;
        }

        const marks = results.multiFaceLandmarks[0];
        const metrics = construirMetricas(marks);

        drawDebug(marks, metrics);
        actualizarEstadoTexto(metrics);
        procesarGestos(metrics);
    });

    const camera = new Camera(video, {
        // Envia cada fotograma de la webcam a FaceMesh para analizar la cara en tiempo real.
        onFrame: async () => {
            await faceMesh.send({ image: video });
        },
        width: 640,
        height: 480
    });

    try {
        await camera.start();
        setStatus("Camara iniciada. Buscando cara...");
    } catch (error) {
        console.error("No se pudo iniciar la camara:", error);
        setStatus("No se pudo iniciar la camara.\nRevisa permisos, navegador y si otra app esta usando la webcam.");
    }
}

// Activa o desactiva el modo desarrollador y limpia el overlay cuando se apaga.
devToggle.addEventListener("change", (event) => {
    devMode = event.target.checked;
    if (!devMode) {
        clearOverlay();
    }
});

iniciarSensor();

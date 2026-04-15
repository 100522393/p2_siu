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
let tiempoInicioGuinyoIzq = null;
let tiempoInicioGuinyoDer = null;

function setStatus(message) {
    statusPanel.textContent = message;
}

function syncCanvasSize() {
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
}

function clearOverlay() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function triggerCooldown() {
    cooldown = true;
    window.setTimeout(() => {
        cooldown = false;
    }, COOLDOWN_MS);
}

function drawPoint(x, y, color = "#57ff72", radius = 2) {
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
}

function drawLine(x1, y1, x2, y2, color = "#ffd24a", width = 2) {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.stroke();
}

function drawText(text, x, y, color = "#ffffff") {
    ctx.fillStyle = color;
    ctx.font = "14px monospace";
    ctx.fillText(text, x, y);
}

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

function drawDebug(marks, metrics) {
    if (!devMode) {
        clearOverlay();
        return;
    }

    clearOverlay();

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

function actualizarEstadoTexto(metrics) {
    setStatus(
        `Modo dev: ${devMode}\n` +
        `Estado nariz: ${metrics.estadoActualNariz}\n` +
        `Offset nariz-cara: ${metrics.noseOffset.toFixed(4)}\n` +
        `Ojo izq: ${metrics.dIzq.toFixed(4)}\n` +
        `Ojo der: ${metrics.dDer.toFixed(4)}\n` +
        `Tiempo ambos: ${metrics.tiempoCierreActual} ms\n` +
        `Tiempo guiño izq: ${metrics.tiempoGuinyoIzqActual} ms\n` +
        `Tiempo guiño der: ${metrics.tiempoGuinyoDerActual} ms\n` +
        `Cooldown: ${cooldown ? "ON" : "OFF"}`
    );
}

function procesarGestos(metrics) {
    if (cooldown) {
        return;
    }

    if (metrics.ambosCerrados && metrics.tiempoCierreActual >= EYES_CLOSED_EXIT_MS) {
        socket.emit("comando-salir");
        tiempoInicioOjosCerrados = null;
        tiempoInicioGuinyoIzq = null;
        tiempoInicioGuinyoDer = null;
        triggerCooldown();
        return;
    }

    if (metrics.soloDerCerrado && metrics.tiempoGuinyoDerActual >= SINGLE_WINK_MS) {
        socket.emit("guiño-derecho");
        tiempoInicioGuinyoDer = null;
        triggerCooldown();
        return;
    }

    if (metrics.soloIzqCerrado && metrics.tiempoGuinyoIzqActual >= SINGLE_WINK_MS) {
        socket.emit("guiño-izquierdo");
        tiempoInicioGuinyoIzq = null;
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
    let tiempoGuinyoIzqActual = 0;
    let tiempoGuinyoDerActual = 0;

    if (ambosCerrados) {
        if (tiempoInicioOjosCerrados === null) {
            tiempoInicioOjosCerrados = Date.now();
        }
        tiempoCierreActual = Date.now() - tiempoInicioOjosCerrados;
        tiempoInicioGuinyoIzq = null;
        tiempoInicioGuinyoDer = null;
    } else {
        tiempoInicioOjosCerrados = null;
    }

    if (soloIzqCerrado) {
        if (tiempoInicioGuinyoIzq === null) {
            tiempoInicioGuinyoIzq = Date.now();
        }
        tiempoGuinyoIzqActual = Date.now() - tiempoInicioGuinyoIzq;
    } else {
        tiempoInicioGuinyoIzq = null;
    }

    if (soloDerCerrado) {
        if (tiempoInicioGuinyoDer === null) {
            tiempoInicioGuinyoDer = Date.now();
        }
        tiempoGuinyoDerActual = Date.now() - tiempoInicioGuinyoDer;
    } else {
        tiempoInicioGuinyoDer = null;
    }

    return {
        dIzq,
        dDer,
        ambosCerrados,
        soloIzqCerrado,
        soloDerCerrado,
        eyeDist,
        tiempoCierreActual,
        tiempoGuinyoIzqActual,
        tiempoGuinyoDerActual,
        ...infoNariz,
        estadoActualNariz: infoNariz.estado
    };
}

function resetDeteccion() {
    estadoNariz = "centro";
    tiempoInicioOjosCerrados = null;
    tiempoInicioGuinyoIzq = null;
    tiempoInicioGuinyoDer = null;
    clearOverlay();
    setStatus("No se detecta ninguna cara.\nComprueba luz, encuadre y distancia a la camara.");
}

async function iniciarSensor() {
    if (!window.FaceMesh || !window.Camera) {
        setStatus("No se han podido cargar las librerias de MediaPipe.");
        return;
    }

    setStatus("Inicializando sensor...");

    const faceMesh = new FaceMesh({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });

    faceMesh.setOptions({
        maxNumFaces: 1,
        refineLandmarks: true,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

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

devToggle.addEventListener("change", (event) => {
    devMode = event.target.checked;
    if (!devMode) {
        clearOverlay();
    }
});

iniciarSensor();

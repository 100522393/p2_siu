const socket = io();

const menu = document.getElementById("menu");
const partituraContenedor = document.getElementById("partitura-contenedor");

let enModoPartitura = false;
let indexMenu = 0;
let pagina = 1;

// Actualiza visualmente que opcion del menu esta seleccionada.
function actualizarSeleccionMenu(nuevoIndice) {
    document.getElementById(`opt${indexMenu}`).classList.remove("seleccionada");
    indexMenu = nuevoIndice;
    document.getElementById(`opt${indexMenu}`).classList.add("seleccionada");
}

// Oculta el menu principal y muestra el visor de partitura.
function abrirPartitura() {
    enModoPartitura = true;
    menu.style.display = "none";
    partituraContenedor.style.display = "flex";
}

// Restaura el estado inicial de la aplicacion y vuelve al menu principal.
function volverInicio() {
    enModoPartitura = false;
    pagina = 1;
    menu.style.display = "block";
    partituraContenedor.style.display = "none";
    partituraContenedor.style.transform = "scale(1)";
    actualizarUI();
}

// Refresca el texto visible del visor con la pagina actual de la partitura.
function actualizarUI() {
    partituraContenedor.innerText = `Página ${pagina}`;
}

// Activa el reconocimiento de voz para volver al inicio o saltar a una pagina concreta.
function iniciarReconocimientoVoz() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "es-ES";
    recognition.continuous = true;

    // Procesa el ultimo comando de voz reconocido y lo traduce a acciones del visor.
    recognition.onresult = (event) => {
        const voz = event.results[event.results.length - 1][0].transcript.toLowerCase();

        if (voz.includes("inicio") || voz.includes("salir")) {
            volverInicio();
        }

        if (voz.includes("pagina") || voz.includes("página")) {
            const numero = voz.match(/\d+/);
            if (numero) {
                pagina = parseInt(numero[0], 10);
                actualizarUI();
            }
        }
    };

    // Reinicia el reconocimiento si el navegador lo detiene para mantener el control por voz activo.
    recognition.onend = () => {
        recognition.start();
    };

    recognition.start();
}

// Recibe movimientos laterales del sensor para navegar por el menu cuando no hay partitura abierta.
socket.on("navegar-menu", (direccion) => {
    if (enModoPartitura) {
        return;
    }

    const nuevoIndice = direccion === "derecha"
        ? (indexMenu + 1) % 3
        : (indexMenu - 1 + 3) % 3;

    actualizarSeleccionMenu(nuevoIndice);
});

// Avanza la partitura o abre el visor si todavia se estaba en el menu.
socket.on("avanzar-pagina", () => {
    if (!enModoPartitura) {
        abrirPartitura();
        return;
    }

    pagina += 1;
    actualizarUI();
});

// Retrocede una pagina mientras haya una partitura abierta y no se este en la primera pagina.
socket.on("retroceder-pagina", () => {
    if (!enModoPartitura || pagina <= 1) {
        return;
    }

    pagina -= 1;
    actualizarUI();
});

// Aplica el nivel de zoom recibido desde el dispositivo sensor.
socket.on("hacer-zoom", (nivel) => {
    partituraContenedor.style.transform = `scale(${nivel})`;
});

// Vuelve al menu principal cuando llega la orden remota de inicio.
socket.on("ir-inicio", volverInicio);

actualizarUI();
iniciarReconocimientoVoz();

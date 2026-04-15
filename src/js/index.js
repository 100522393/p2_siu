const socket = io();

const menu = document.getElementById("menu");
const partituraContenedor = document.getElementById("partitura-contenedor");

let enModoPartitura = false;
let indexMenu = 0;
let pagina = 1;

function actualizarSeleccionMenu(nuevoIndice) {
    document.getElementById(`opt${indexMenu}`).classList.remove("seleccionada");
    indexMenu = nuevoIndice;
    document.getElementById(`opt${indexMenu}`).classList.add("seleccionada");
}

function abrirPartitura() {
    enModoPartitura = true;
    menu.style.display = "none";
    partituraContenedor.style.display = "flex";
}

function volverInicio() {
    enModoPartitura = false;
    pagina = 1;
    menu.style.display = "block";
    partituraContenedor.style.display = "none";
    partituraContenedor.style.transform = "scale(1)";
    actualizarUI();
}

function actualizarUI() {
    partituraContenedor.innerText = `Página ${pagina}`;
}

function iniciarReconocimientoVoz() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
        return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "es-ES";
    recognition.continuous = true;

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

    recognition.onend = () => {
        recognition.start();
    };

    recognition.start();
}

socket.on("navegar-menu", (direccion) => {
    if (enModoPartitura) {
        return;
    }

    const nuevoIndice = direccion === "derecha"
        ? (indexMenu + 1) % 3
        : (indexMenu - 1 + 3) % 3;

    actualizarSeleccionMenu(nuevoIndice);
});

socket.on("avanzar-pagina", () => {
    if (!enModoPartitura) {
        abrirPartitura();
        return;
    }

    pagina += 1;
    actualizarUI();
});

socket.on("retroceder-pagina", () => {
    if (!enModoPartitura || pagina <= 1) {
        return;
    }

    pagina -= 1;
    actualizarUI();
});

socket.on("hacer-zoom", (nivel) => {
    partituraContenedor.style.transform = `scale(${nivel})`;
});

socket.on("ir-inicio", volverInicio);

actualizarUI();
iniciarReconocimientoVoz();

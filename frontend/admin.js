const formulari = document.getElementById('formulari');
const opcions = document.getElementById('opcions');
const missatgeFormulari = document.getElementById('missatge-formulari');
const estatLlista = document.getElementById('estat-llista');
const llista = document.getElementById('preguntes');
const botoDesar = document.getElementById('desar');
const botoCancelar = document.getElementById('cancel·lar');
let idEnEdicio = null;

function actualitzarEliminacioOpcions() {
    const deshabilitat = opcions.children.length <= 2;
    opcions.querySelectorAll('button').forEach(boto => {
        boto.disabled = deshabilitat;
    });
}

function afegirOpcio(text = '', correcta = false) {
    const fila = document.createElement('div');
    fila.className = 'admin-opcio';

    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'resposta-correcta';
    radio.required = true;
    radio.checked = correcta;
    radio.setAttribute('aria-label', 'Resposta correcta');

    const camp = document.createElement('input');
    camp.type = 'text';
    camp.maxLength = 500;
    camp.required = true;
    camp.value = text;
    camp.placeholder = 'Opció de resposta';
    camp.setAttribute('aria-label', 'Opció de resposta');

    const eliminar = document.createElement('button');
    eliminar.type = 'button';
    eliminar.textContent = 'Eliminar';
    eliminar.addEventListener('click', () => {
        if (opcions.children.length <= 2) return;
        const eraCorrecta = radio.checked;
        fila.remove();
        if (eraCorrecta) opcions.querySelector('input[type="radio"]').checked = true;
        actualitzarEliminacioOpcions();
    });

    fila.append(radio, camp, eliminar);
    opcions.append(fila);
    actualitzarEliminacioOpcions();
}

function reiniciarFormulari() {
    idEnEdicio = null;
    formulari.reset();
    opcions.replaceChildren();
    afegirOpcio('', true);
    afegirOpcio();
    afegirOpcio();
    document.getElementById('titol-formulari').textContent = 'Crear pregunta';
    botoDesar.textContent = 'Crear pregunta';
    botoCancelar.hidden = true;
    missatgeFormulari.textContent = '';
}

async function cridarApi(url, configuracio = {}) {
    const resposta = await fetch(url, configuracio);
    if (!resposta.ok) {
        let detall = '';
        try {
            detall = (await resposta.json()).error || '';
        } catch {
            detall = '';
        }
        throw new Error(detall || `Error del servidor (${resposta.status}).`);
    }
    return resposta.status === 204 ? null : resposta.json();
}

function mostrarPreguntes(preguntes) {
    llista.replaceChildren();
    estatLlista.textContent = preguntes.length
        ? `${preguntes.length} preguntes`
        : 'Encara no hi ha preguntes.';

    preguntes.forEach(pregunta => {
        const item = document.createElement('article');
        item.className = 'admin-item';
        const contingut = document.createElement('div');
        const titol = document.createElement('h3');
        titol.textContent = pregunta.pregunta;
        contingut.append(titol);

        pregunta.opcions.forEach(opcio => {
            const text = document.createElement('p');
            text.textContent = opcio;
            if (opcio === pregunta.resposta_correcta) {
                const marca = document.createElement('strong');
                marca.className = 'correcta';
                marca.textContent = ' (correcta)';
                text.append(marca);
            }
            contingut.append(text);
        });
        if (pregunta.imatge) {
            const imatge = document.createElement('p');
            imatge.textContent = `Imatge: ${pregunta.imatge}`;
            contingut.append(imatge);
        }

        const accions = document.createElement('div');
        accions.className = 'admin-accions';
        const editar = document.createElement('button');
        editar.type = 'button';
        editar.textContent = 'Modificar';
        editar.addEventListener('click', () => editarPregunta(pregunta));
        const eliminar = document.createElement('button');
        eliminar.type = 'button';
        eliminar.className = 'admin-eliminar';
        eliminar.textContent = 'Eliminar';
        eliminar.addEventListener('click', () => eliminarPregunta(pregunta));
        accions.append(editar, eliminar);
        item.append(contingut, accions);
        llista.append(item);
    });
}

async function carregarPreguntes() {
    estatLlista.classList.remove('error');
    estatLlista.textContent = 'Carregant preguntes...';
    try {
        mostrarPreguntes(await cridarApi('/api/preguntes'));
    } catch (error) {
        estatLlista.classList.add('error');
        estatLlista.textContent = `No s'han pogut carregar les preguntes: ${error.message}`;
    }
}

function editarPregunta(pregunta) {
    idEnEdicio = pregunta.id;
    formulari.elements.pregunta.value = pregunta.pregunta;
    formulari.elements.imatge.value = pregunta.imatge || '';
    opcions.replaceChildren();
    pregunta.opcions.forEach(opcio => afegirOpcio(opcio, opcio === pregunta.resposta_correcta));
    document.getElementById('titol-formulari').textContent = 'Modificar pregunta';
    botoDesar.textContent = 'Desar canvis';
    botoCancelar.hidden = false;
    formulari.scrollIntoView({ behavior: 'smooth' });
}

async function eliminarPregunta(pregunta) {
    if (!confirm(`Eliminar la pregunta «${pregunta.pregunta}»?`)) return;
    try {
        await cridarApi(`/api/preguntes/${pregunta.id}`, { method: 'DELETE' });
        if (idEnEdicio === pregunta.id) reiniciarFormulari();
        await carregarPreguntes();
    } catch (error) {
        estatLlista.classList.add('error');
        estatLlista.textContent = `No s'ha pogut eliminar: ${error.message}`;
    }
}

document.getElementById('afegir-opcio').addEventListener('click', () => afegirOpcio());
botoCancelar.addEventListener('click', reiniciarFormulari);

formulari.addEventListener('submit', async event => {
    event.preventDefault();
    const campsOpcio = [...opcions.querySelectorAll('input[type="text"]')];
    const opcionsText = campsOpcio.map(camp => camp.value.trim());
    if (new Set(opcionsText).size !== opcionsText.length) {
        missatgeFormulari.textContent = 'No repetiu les opcions.';
        missatgeFormulari.classList.add('error');
        return;
    }
    const correcta = [...opcions.querySelectorAll('input[type="radio"]')]
        .findIndex(radio => radio.checked);
    if (correcta < 0) {
        missatgeFormulari.textContent = 'Seleccioneu la resposta correcta.';
        missatgeFormulari.classList.add('error');
        return;
    }

    const dades = {
        pregunta: formulari.elements.pregunta.value.trim(),
        opcions: opcionsText,
        resposta_correcta: opcionsText[correcta],
        imatge: formulari.elements.imatge.value.trim() || null
    };
    const id = idEnEdicio;
    botoDesar.disabled = true;
    missatgeFormulari.classList.remove('error');
    missatgeFormulari.textContent = 'Desant...';
    try {
        await cridarApi(id ? `/api/preguntes/${id}` : '/api/preguntes', {
            method: id ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dades)
        });
        reiniciarFormulari();
        await carregarPreguntes();
        missatgeFormulari.textContent = id ? 'Pregunta modificada.' : 'Pregunta creada.';
    } catch (error) {
        missatgeFormulari.classList.add('error');
        missatgeFormulari.textContent = `No s'ha pogut desar: ${error.message}`;
    } finally {
        botoDesar.disabled = false;
    }
});

reiniciarFormulari();
carregarPreguntes();

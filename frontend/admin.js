const apiUrl = '/api/preguntes';
const form = document.getElementById('question-form');
const optionsContainer = document.getElementById('options-container');
const questionText = document.getElementById('question-text');
const questionImage = document.getElementById('question-image');
const removeImage = document.getElementById('remove-image');
const removeImageLabel = document.getElementById('remove-image-label');
const imagePreviewContainer = document.getElementById('image-preview-container');
const imagePreview = document.getElementById('image-preview');
const formStatus = document.getElementById('form-status');
const listStatus = document.getElementById('list-status');
const questionsList = document.getElementById('questions-list');
const saveButton = document.getElementById('save-question');
const cancelButton = document.getElementById('cancel-edit');
const questionCount = document.getElementById('question-count');
let editingId = null;
let editingImagePath = null;
let previewObjectUrl = null;

function showStatus(element, message, success = false) {
    element.textContent = message;
    element.classList.toggle('success', success);
}

async function readResponse(response) {
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
        throw new Error(data?.error || `La petició ha fallat (${response.status}).`);
    }
    return data;
}

function addOption(value = '', correct = false) {
    const row = document.createElement('div');
    row.className = 'option-row';

    const text = document.createElement('input');
    text.type = 'text';
    text.required = true;
    text.maxLength = 500;
    text.placeholder = 'Text de la resposta';
    text.value = value;
    text.setAttribute('aria-label', 'Text de la resposta');

    const correctLabel = document.createElement('label');
    correctLabel.className = 'correct-choice';
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'correct-option';
    radio.required = true;
    radio.checked = correct;
    const correctText = document.createElement('span');
    correctText.textContent = 'Correcta';
    correctLabel.append(radio, correctText);

    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-option secondary-button';
    remove.textContent = 'Treure';
    remove.setAttribute('aria-label', 'Eliminar aquesta resposta');
    remove.addEventListener('click', () => {
        if (optionsContainer.children.length <= 2) {
            showStatus(formStatus, 'Cal mantenir com a mínim dues respostes.');
            return;
        }
        row.remove();
        if (!optionsContainer.querySelector('input[type="radio"]:checked')) {
            optionsContainer.querySelector('input[type="radio"]').checked = true;
        }
    });

    row.append(text, correctLabel, remove);
    optionsContainer.append(row);
}

function resetForm() {
    form.reset();
    optionsContainer.replaceChildren();
    for (let i = 0; i < 4; i++) addOption('', i === 0);
    editingId = null;
    document.getElementById('form-title').textContent = 'Crear pregunta';
    saveButton.textContent = 'Crear pregunta';
    cancelButton.hidden = true;
    removeImageLabel.hidden = true;
    editingImagePath = null;
    imagePreviewContainer.hidden = true;
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
    imagePreview.removeAttribute('src');
    showStatus(formStatus, '');
}

function makeQuestionCard(question) {
    const card = document.createElement('article');
    card.className = 'question-card';

    const heading = document.createElement('div');
    heading.className = 'question-card-heading';
    const title = document.createElement('h3');
    title.textContent = question.pregunta;
    const id = document.createElement('span');
    id.className = 'question-id';
    id.textContent = `#${question.id}`;
    heading.append(title, id);
    card.append(heading);

    if (question.imatge) {
        const image = document.createElement('img');
        image.className = 'question-image';
        image.src = question.imatge;
        image.alt = `Imatge de la pregunta ${question.id}`;
        image.loading = 'lazy';
        card.append(image);
    }

    const answers = document.createElement('ul');
    for (const option of question.opcions) {
        const item = document.createElement('li');
        item.textContent = option;
        if (option === question.resposta_correcta) {
            const badge = document.createElement('span');
            badge.className = 'correct-answer';
            badge.textContent = ' — Correcta';
            item.append(badge);
        }
        answers.append(item);
    }
    card.append(answers);

    const actions = document.createElement('div');
    actions.className = 'card-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.textContent = 'Editar';
    edit.addEventListener('click', () => populateForm(question));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'delete-button';
    remove.textContent = 'Eliminar';
    remove.addEventListener('click', () => deleteQuestion(question));
    actions.append(edit, remove);
    card.append(actions);
    return card;
}

async function loadQuestions() {
    showStatus(listStatus, 'Carregant preguntes...');
    try {
        const questions = await readResponse(await fetch(apiUrl));
        questionsList.replaceChildren();
        questionCount.textContent = `${questions.length} preguntes`;
        if (questions.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'empty-state';
            empty.textContent = 'Encara no hi ha cap pregunta.';
            questionsList.append(empty);
        } else {
            questions.forEach(question => questionsList.append(makeQuestionCard(question)));
        }
        showStatus(listStatus, '', true);
    } catch (error) {
        showStatus(listStatus, error.message);
    }
}

function populateForm(question) {
    editingId = question.id;
    editingImagePath = question.imatge;
    questionText.value = question.pregunta;
    optionsContainer.replaceChildren();
    question.opcions.forEach(option => addOption(option, option === question.resposta_correcta));
    questionImage.value = '';
    removeImage.checked = false;
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
    removeImageLabel.hidden = !question.imatge;
    imagePreviewContainer.hidden = !question.imatge;
    if (question.imatge) imagePreview.src = question.imatge;
    else imagePreview.removeAttribute('src');
    document.getElementById('form-title').textContent = `Editar pregunta #${question.id}`;
    saveButton.textContent = 'Desar canvis';
    cancelButton.hidden = false;
    showStatus(formStatus, '');
    questionText.focus();
}

async function deleteQuestion(question) {
    if (!window.confirm(`Vols eliminar la pregunta «${question.pregunta}»?`)) return;
    try {
        await readResponse(await fetch(`${apiUrl}/${question.id}`, { method: 'DELETE' }));
        if (editingId === question.id) resetForm();
        await loadQuestions();
        showStatus(listStatus, 'Pregunta eliminada.', true);
    } catch (error) {
        showStatus(listStatus, error.message);
    }
}

document.getElementById('add-option').addEventListener('click', () => addOption());
document.getElementById('refresh-questions').addEventListener('click', loadQuestions);
cancelButton.addEventListener('click', resetForm);

questionImage.addEventListener('change', () => {
    const file = questionImage.files[0];
    if (!file) {
        if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
        previewObjectUrl = null;
        imagePreviewContainer.hidden = !editingImagePath || removeImage.checked;
        if (editingImagePath) imagePreview.src = editingImagePath;
        else imagePreview.removeAttribute('src');
        return;
    }
    removeImage.checked = false;
    if (previewObjectUrl) URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = URL.createObjectURL(file);
    imagePreview.src = previewObjectUrl;
    imagePreviewContainer.hidden = false;
});

removeImage.addEventListener('change', () => {
    if (removeImage.checked && !questionImage.files[0]) {
        imagePreviewContainer.hidden = true;
    } else if (!removeImage.checked && editingImagePath && !questionImage.files[0]) {
        imagePreviewContainer.hidden = false;
    }
});

form.addEventListener('submit', async event => {
    event.preventDefault();
    const rows = [...optionsContainer.querySelectorAll('.option-row')];
    const options = rows.map(row => row.querySelector('input[type="text"]').value.trim());
    const correctIndex = rows.findIndex(row => row.querySelector('input[type="radio"]').checked);
    if (options.length < 2 || options.some(option => !option) || correctIndex < 0) {
        showStatus(formStatus, 'Indica com a mínim dues respostes i marca la resposta correcta.');
        return;
    }

    const data = new FormData();
    data.append('pregunta', questionText.value.trim());
    data.append('opcions', JSON.stringify(options));
    data.append('resposta_correcta', options[correctIndex]);
    if (questionImage.files[0]) data.append('imatge', questionImage.files[0]);
    if (removeImage.checked) data.append('remove_image', 'true');

    const successMessage = editingId ? 'Canvis desats.' : 'Pregunta creada.';
    saveButton.disabled = true;
    showStatus(formStatus, editingId ? 'Desant els canvis...' : 'Creant la pregunta...');
    try {
        const url = editingId ? `${apiUrl}/${editingId}` : apiUrl;
        await readResponse(await fetch(url, { method: editingId ? 'PUT' : 'POST', body: data }));
        resetForm();
        await loadQuestions();
        showStatus(formStatus, successMessage, true);
    } catch (error) {
        showStatus(formStatus, error.message);
    } finally {
        saveButton.disabled = false;
    }
});

resetForm();
loadQuestions();

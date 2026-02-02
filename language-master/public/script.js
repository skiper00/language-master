const API = 'http://localhost:3000/api';

// ============================================================
// 1. МОДУЛЬ АВТОРИЗАЦИИ (AUTH)
// ============================================================
const auth = {
    token: localStorage.getItem('token'),
    user: JSON.parse(localStorage.getItem('user')) || null,

    init() {
        // Анимация заставки
        setTimeout(() => {
            const splash = document.getElementById('splash-screen');
            if(splash) {
                splash.style.opacity = 0;
                setTimeout(() => {
                    splash.style.display = 'none';
                    // Если есть токен — запускаем приложение, иначе — экран входа
                    if (this.token && this.user) app.start(this.user);
                    else document.getElementById('auth-screen').style.display = 'flex';
                }, 500);
            }
        }, 2000);

        // Обработчики форм
        document.getElementById('login-form').onsubmit = this.handleLogin.bind(this);
        document.getElementById('register-form').onsubmit = this.handleRegister.bind(this);
        
        // Загрузка аватара
        const avatarInput = document.getElementById('avatar-upload');
        if(avatarInput) avatarInput.onchange = this.uploadAvatar.bind(this);
    },

    async handleLogin(e) {
        e.preventDefault();
        const email = document.getElementById('login-email').value;
        const password = document.getElementById('login-pass').value;
        
        try {
            const res = await fetch(`${API}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);

            this.loginSuccess(data);
        } catch (err) { alert(err.message); }
    },

    async handleRegister(e) {
        e.preventDefault();
        const name = document.getElementById('reg-name').value;
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-pass').value;
        const role = document.querySelector('input[name="role"]:checked').value;

        try {
            const res = await fetch(`${API}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email, password, role })
            });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
            
            alert('Аккаунт создан! Войдите.');
            ui.showLogin();
        } catch (err) { alert(err.message); }
    },

    async uploadAvatar(e) {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('avatar', file);
        formData.append('userId', this.user.id);

        try {
            const res = await fetch(`${API}/upload-avatar`, { method: 'POST', body: formData });
            const data = await res.json();
            if (data.avatarUrl) {
                this.user.avatar = data.avatarUrl;
                localStorage.setItem('user', JSON.stringify(this.user));
                // Обновляем аватарку в интерфейсе
                document.getElementById('sidebar-avatar').src = data.avatarUrl;
            }
        } catch(e) { console.error(e); }
    },

    loginSuccess(data) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
        this.token = data.token;
        this.user = data.user;
        document.getElementById('auth-screen').style.display = 'none';
        app.start(data.user);
    },

    logout() {
        localStorage.clear();
        location.reload();
    }
};

const ui = {
    showRegister: () => { 
        document.getElementById('login-form').style.display='none'; 
        document.getElementById('register-form').style.display='block'; 
        document.getElementById('auth-title').innerText='Регистрация'; 
    },
    showLogin: () => { 
        document.getElementById('register-form').style.display='none'; 
        document.getElementById('login-form').style.display='block'; 
        document.getElementById('auth-title').innerText='Вход в систему'; 
    }
};

// ============================================================
// 2. ОСНОВНОЕ ПРИЛОЖЕНИЕ (APP)
// ============================================================
const app = {
    user: null,
    currentLang: 'en',
    interfaceLang: 'ru',
    currentTab: 'home',
    completedLessons: [], // Загружаем из БД
    streak: 0,
    currentLevel: 'A1',
    lastScroll: 0,
    totalLessonsCount: 0,

    translations: {
        ru: {
            home: 'Главная', lessons: 'Уроки', dictionary: 'Словарь', quiz: 'Тренировка',
            back: '← Назад', search: 'Поиск слова...', streak: 'Дней в ударе',
            statusDone: '✅ Пройдено', statusNotDone: '⭕ Не пройдено', dashboard: 'Мои классы'
        },
        en: {
            home: 'Home', lessons: 'Lessons', dictionary: 'Dictionary', quiz: 'Quiz',
            back: '← Back', search: 'Search word...', streak: 'Day Streak',
            statusDone: '✅ Completed', statusNotDone: '⭕ Not started', dashboard: 'My Classes'
        }
    },

    // --- ЗАПУСК ПОСЛЕ АВТОРИЗАЦИИ ---
    async start(user) {
        this.user = user;
        document.getElementById('app-container').style.display = 'flex';
        
        // Заполняем профиль в сайдбаре
        document.getElementById('user-name-display').innerText = user.name;
        document.getElementById('user-id-display').innerText = `ID: ${user.id}`;
        document.getElementById('sidebar-avatar').src = user.avatar;

        // Настройка языкового переключателя
        const langSelect = document.getElementById('lang-switch');
        if (langSelect) {
            langSelect.addEventListener('change', (e) => {
                this.interfaceLang = e.target.value;
                this.updateMenu();
                this.tab(this.currentTab); // Перерисовать текущую вкладку
            });
        }
        this.updateMenu();

        // Разделение ролей
        if (user.role === 'teacher') {
            document.getElementById('student-nav').style.display = 'none';
            document.getElementById('teacher-nav').style.display = 'block';
            this.tab('dashboard');
        } else {
            document.getElementById('student-nav').style.display = 'block';
            document.getElementById('teacher-nav').style.display = 'none';
            
            // Инициализация данных ученика
            await this.loadProgress();     // Из БД
            this.calculateStreak();        // Локально (можно перенести в БД потом)
            this.fetchTotalLessons();      // Для статистики
            this.tab('home');
        }
    },

    // Загрузка прогресса из БД
    async loadProgress() {
        try {
            const res = await fetch(`${API}/progress/${this.user.id}`);
            const ids = await res.json();
            this.completedLessons = ids; 
        } catch(e) { console.error(e); }
    },

    async fetchTotalLessons() {
        try {
            const res = await fetch(`${API}/lessons?lang=en`);
            const lessons = await res.json();
            this.totalLessonsCount = lessons.length;
        } catch (e) { console.error(e); }
    },

    calculateStreak() {
        const lastDate = localStorage.getItem('lastLoginDate');
        const today = new Date().toDateString();
        let currentStreak = parseInt(localStorage.getItem('streak') || 0);

        if (lastDate !== today) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);

            if (lastDate === yesterday.toDateString()) {
                currentStreak++;
            } else {
                if (lastDate !== null && lastDate !== today) currentStreak = 1;
                else if (lastDate === null) currentStreak = 1;
            }
            localStorage.setItem('lastLoginDate', today);
            localStorage.setItem('streak', currentStreak);
        }
        this.streak = currentStreak;
    },

    updateMenu() {
        const t = this.translations[this.interfaceLang];
        ['home', 'lessons', 'dictionary', 'quiz', 'dashboard'].forEach(id => {
            const btn = document.getElementById(`btn-${id}`);
            if (btn) {
                const span = btn.querySelector('span');
                if (span && t[id]) span.innerText = t[id];
            }
        });
    },

    // --- НАВИГАЦИЯ ---
    tab(tabName) {
        if (this.currentTab === 'lessons' && tabName !== 'lessons') {
            this.lastScroll = 0;
        }
        this.currentTab = tabName;
        
        // Подсветка кнопки
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const activeBtn = document.getElementById(tabName === 'dashboard' ? 'btn-dashboard' : `btn-${tabName}`);
        if (activeBtn) activeBtn.classList.add('active');

        // Рендер контента
        const area = document.getElementById('content-area');
        area.innerHTML = '';

        if (tabName === 'home') this.renderHome(area);
        else if (tabName === 'lessons') this.renderLevels(area);
        else if (tabName === 'dictionary') this.renderDictionary(area);
        else if (tabName === 'quiz') this.renderTraining(area);
        else if (tabName === 'dashboard') this.renderTeacherDashboard(area);
    },

    // ============================================================
    // 3. ФУНКЦИОНАЛ УЧИТЕЛЯ (DASHBOARD)
    // ============================================================
    async renderTeacherDashboard(container) {
        const t = this.translations[this.interfaceLang];
        container.innerHTML = `<h1>Мои классы</h1><div id="classes-loader">Загрузка...</div>`;

        try {
            const res = await fetch(`${API}/teacher/dashboard/${this.user.id}`);
            const classes = await res.json();
            
            let html = `
                <div class="create-class-box">
                    <input type="text" id="new-class-name" placeholder="Название нового класса (напр. 10-А)">
                    <button onclick="app.createClass()" class="primary-btn" style="width:auto; margin:0">Создать</button>
                </div>
            `;

            classes.forEach(cls => {
                html += `
                    <div class="class-card">
                        <div class="class-header">
                            <h3>${cls.class_name}</h3>
                            <span style="color:#7f8c8d">Учеников: ${cls.students.length}</span>
                        </div>
                        <div class="students-list">
                            ${cls.students.length === 0 ? '<p style="color:#ccc; font-style:italic">В этом классе пока нет учеников</p>' : ''}
                            ${cls.students.map(s => `
                                <div class="student-row">
                                    <img src="${s.avatar}" class="mini-avatar">
                                    <div class="st-info">
                                        <b>${s.name}</b> <small>(ID: ${s.user_id})</small><br>
                                        <small>Пройдено уроков: <b style="color:#2ecc71">${s.lessons_done}</b></small>
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                        <div class="add-student-form">
                            <input type="number" id="add-st-${cls.class_id}" placeholder="ID ученика">
                            <button onclick="app.addStudent(${cls.class_id})"><i class="fas fa-plus"></i></button>
                        </div>
                    </div>
                `;
            });
            
            container.innerHTML = html;
        } catch (e) {
            container.innerHTML = `<p style="color:red">Ошибка: ${e.message}</p>`;
        }
    },

    async createClass() {
        const name = document.getElementById('new-class-name').value;
        if (!name) return;
        await fetch(`${API}/teacher/classes`, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ teacherId: this.user.id, name })
        });
        this.tab('dashboard');
    },

    async addStudent(classId) {
        const studentId = document.getElementById(`add-st-${classId}`).value;
        if (!studentId) return;
        const res = await fetch(`${API}/teacher/add-student`, {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ classId, studentId })
        });
        const data = await res.json();
        if (data.error) alert(data.error);
        else this.tab('dashboard');
    },

    // ============================================================
    // 4. ФУНКЦИОНАЛ УЧЕНИКА: ГЛАВНАЯ И УРОКИ
    // ============================================================
    renderHome(container) {
        const t = this.translations[this.interfaceLang];
        const total = this.totalLessonsCount || 150; 
        const doneCount = this.completedLessons.length;
        const progress = Math.min(100, Math.round((doneCount / total) * 100));

        container.innerHTML = `
            <div class="welcome-box">
                <h1>Привет, ${this.user.name}! 👋</h1>
                <p>Ты уже прошел <b>${doneCount}</b> уроков. Так держать!</p>
                <button class="primary-btn" style="width:auto; margin-top:15px; background:rgba(255,255,255,0.2)" onclick="app.tab('lessons')">Продолжить обучение →</button>
            </div>

            <div class="stats-grid">
                <div class="stat-box">
                    <div class="stat-icon fire">🔥</div>
                    <div class="stat-info"><h2>${this.streak}</h2><p>${t.streak}</p></div>
                </div>
                <div class="stat-box">
                    <div class="stat-icon trophy">🏆</div>
                    <div class="stat-info"><h2>${progress}%</h2><p>Прогресс курса</p></div>
                </div>
                <div class="stat-box">
                    <div class="stat-icon bolt">⚡</div>
                    <div class="stat-info"><h2>${this.currentLevel}</h2><p>Текущий уровень</p></div>
                </div>
            </div>
        `;
    },

    async renderLevels(container) {
        const t = this.translations[this.interfaceLang];
        container.innerHTML = `<h2>${t.lessons}</h2><div id="levels-nav"></div><div id="lessons-list"></div>`;
        const nav = document.getElementById('levels-nav');

        const res = await fetch(`${API}/lessons?lang=en`);
        const lessons = await res.json();
        this.totalLessonsCount = lessons.length;

        ['A1', 'A2', 'B1', 'B2', 'C1'].forEach(lvl => {
            const btn = document.createElement('button');
            btn.className = 'lvl-tab';
            btn.innerText = lvl;
            btn.onclick = () => {
                if (this.currentLevel !== lvl) this.lastScroll = 0;
                this.currentLevel = lvl;
                document.querySelectorAll('.lvl-tab').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                this.showLessonsByLevel(lessons.filter(l => l.level_code === lvl));
            };
            nav.appendChild(btn);
        });

        const savedBtn = Array.from(nav.children).find(b => b.innerText === this.currentLevel);
        if (savedBtn) savedBtn.click();
        else if (nav.firstChild) nav.firstChild.click();
    },

    showLessonsByLevel(list) {
        const container = document.getElementById('lessons-list');
        container.innerHTML = list.map(l => `
            <div class="lesson-card ${this.completedLessons.includes(l.lesson_id) ? 'done' : ''}" onclick="app.openLesson(${l.lesson_id})">
                <div style="display:flex; justify-content:space-between; align-items:center; width:100%">
                    <h3>${l.title_ru}</h3>
                    ${this.completedLessons.includes(l.lesson_id) ? '<i class="fas fa-check-circle" style="color:#2ecc71"></i>' : ''}
                </div>
            </div>
        `).join('');

        if (this.lastScroll > 0) {
            setTimeout(() => {
                const main = document.querySelector('.main-content');
                if (main) main.scrollTop = this.lastScroll;
            }, 0);
        }
    },

    openLesson(id) {
        const main = document.querySelector('.main-content');
        this.lastScroll = main ? main.scrollTop : 0;
        this.loadLesson(id);
    },

    async loadLesson(id) {
        const res = await fetch(`${API}/lessons/${id}`);
        const data = await res.json();
        const lesson = data.lesson;
        const tasks = data.tasks || [];
        const t = this.translations[this.interfaceLang];

        const isDone = this.completedLessons.includes(lesson.lesson_id);

        let videoHTML = '';
        if (lesson.video_url) {
            videoHTML = `<div class="video-container"><iframe src="${lesson.video_url}" frameborder="0" allowfullscreen></iframe></div>`;
        }

        const statusBtn = `
            <button class="status-toggle ${isDone ? 'done' : ''}" onclick="app.toggleLessonStatus(${lesson.lesson_id}, this)">
                ${isDone ? t.statusDone : t.statusNotDone}
            </button>
        `;

        document.getElementById('content-area').innerHTML = `
            <button onclick="app.tab('lessons')" class="back-btn">${t.back}</button>
            <div class="lesson-header"><h1>${lesson.title_ru}</h1>${statusBtn}</div>
            <div class="theory-box">${lesson.theory_content}</div>
            ${videoHTML} 
            <div class="practice-section">
                <h2>Практика</h2>
                <div id="tasks-wrapper">${tasks.map((task, index) => this.renderTaskHTML(task, index)).join('')}</div>
            </div>
        `;
        document.querySelector('.main-content').scrollTop = 0;
    },

    // --- ОБНОВЛЕННАЯ ФУНКЦИЯ СТАТУСА (С БАЗОЙ ДАННЫХ) ---
    async toggleLessonStatus(id, btnElement) {
        const t = this.translations[this.interfaceLang];
        const isCompleted = this.completedLessons.includes(id);

        // 1. Отправляем запрос на сервер
        const method = isCompleted ? 'DELETE' : 'POST';
        try {
            await fetch(`${API}/progress`, {
                method: method,
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({ userId: this.user.id, lessonId: id })
            });

            // 2. Если успешно - обновляем UI
            if (isCompleted) {
                this.completedLessons = this.completedLessons.filter(lessonId => lessonId !== id);
                btnElement.classList.remove('done');
                btnElement.innerText = t.statusNotDone;
            } else {
                this.completedLessons.push(id);
                btnElement.classList.add('done');
                btnElement.innerText = t.statusDone;
            }
        } catch (e) {
            alert("Ошибка сохранения прогресса");
        }
    },

    renderTaskHTML(task, index) {
        let content = '';
        if (task.task_type === 'multiple-choice') {
            let options = [];
            if (task.options_json) {
                try { options = typeof task.options_json === 'string' ? JSON.parse(task.options_json) : task.options_json; } catch (e) { options = []; }
            }
            content = `
                <div class="options-group">
                    ${options.map(opt => `
                        <label class="task-option" onclick="app.checkAnswer(this, '${opt.trim()}', '${task.correct_answer}')">
                            <input type="radio" name="task_${task.task_id}">
                            <span>${opt.trim()}</span>
                        </label>
                    `).join('')}
                </div><div class="feedback"></div>`;
        } else if (task.task_type === 'fill-in') {
            content = `
                <div class="input-group" style="flex-direction:row; gap:10px;">
                    <input type="text" class="task-input" placeholder="..." id="input_${task.task_id}">
                    <button class="primary-btn" style="width:auto; margin:0;" onclick="app.checkInput(${task.task_id}, '${task.correct_answer}')">OK</button>
                </div><div class="feedback" id="feedback_${task.task_id}"></div>`;
        }
        return `<div class="task-card"><p><b>${index + 1}.</b> ${task.question_text}</p>${content}</div>`;
    },

    checkAnswer(label, selected, correct) {
        const parent = label.closest('.task-card');
        const feedback = parent.querySelector('.feedback');
        parent.querySelectorAll('.task-option').forEach(l => {
            l.style.borderColor = '#ddd';
            l.style.background = '#fff';
        });
        feedback.classList.add('visible');
        if (selected.toLowerCase() === correct.toLowerCase()) {
            label.style.borderColor = '#2ecc71';
            label.style.background = '#eafaf1';
            feedback.style.background = '#eafaf1';
            feedback.innerHTML = '<span style="color:#27ae60">✅ Верно!</span>';
        } else {
            label.style.borderColor = '#e74c3c';
            label.style.background = '#fdeaea';
            feedback.style.background = '#fdeaea';
            feedback.innerHTML = `<span style="color:#c0392b">❌ Ошибка. Ответ: <b>${correct}</b></span>`;
        }
    },

    checkInput(taskId, correct) {
        const input = document.getElementById(`input_${taskId}`);
        const feedback = document.getElementById(`feedback_${taskId}`);
        const val = input.value.trim().toLowerCase();
        feedback.classList.add('visible');
        if (val === correct.toLowerCase()) {
            input.style.borderColor = '#2ecc71';
            feedback.style.background = '#eafaf1';
            feedback.innerHTML = '<span style="color:#27ae60">✅ Верно!</span>';
        } else {
            input.style.borderColor = '#e74c3c';
            feedback.style.background = '#fdeaea';
            feedback.innerHTML = `<span style="color:#c0392b">❌ Ответ: <b>${correct}</b></span>`;
        }
    },

    // ============================================================
    // 5. СЛОВАРЬ
    // ============================================================
    async renderDictionary(container) {
        const t = this.translations[this.interfaceLang];
        container.innerHTML = `
            <h1>${t.dictionary}</h1>
            <div class="dict-controls">
                <input type="text" id="dict-search" class="search-box" placeholder="${t.search}">
                <select id="dict-level-filter" class="dict-filter">
                    <option value="ALL">Все уровни</option>
                    <option value="A1">A1</option><option value="A2">A2</option>
                    <option value="B1">B1</option><option value="B2">B2</option><option value="C1">C1</option>
                </select>
            </div>
            <div id="words-grid" class="words-grid">Загрузка...</div>
        `;

        const res = await fetch(`${API}/words?lang=en`);
        const words = await res.json();
        words.sort((a, b) => a.word.localeCompare(b.word));

        const grid = document.getElementById('words-grid');
        const searchInput = document.getElementById('dict-search');
        const levelSelect = document.getElementById('dict-level-filter');

        const draw = () => {
            const query = searchInput.value.toLowerCase();
            const level = levelSelect.value;
            const filtered = words.filter(w => {
                const matchesSearch = w.word.toLowerCase().includes(query) || w.translation_ru.toLowerCase().includes(query);
                const matchesLevel = level === 'ALL' || w.level_code === level;
                return matchesSearch && matchesLevel;
            });
            grid.innerHTML = filtered.map(w => `
                <div class="word-card">
                    <b>${w.word}</b> <span style="font-size:0.8em; color:#bdc3c7;">${w.level_code}</span><br>
                    <small>${w.translation_ru}</small>
                </div>`).join('');
        };
        draw();
        searchInput.oninput = draw;
        levelSelect.onchange = draw;
    },

    // ============================================================
    // 6. ИГРЫ И ТРЕНИРОВКИ
    // ============================================================
    async renderTraining(container) {
        const t = this.translations[this.interfaceLang];
        container.innerHTML = `
            <div id="training-menu">
                <h1>${t.quiz}</h1>
                <p style="color:#7f8c8d; margin-bottom:20px;">Выберите режим обучения:</p>
                <div class="modes-grid">
                    <div class="mode-card" id="btn-start-quiz"><span class="mode-icon">❓</span><h3>Викторина</h3><p>Выберите правильный перевод</p></div>
                    <div class="mode-card" id="btn-start-flashcards"><span class="mode-icon">🃏</span><h3>Карточки</h3><p>Вспомни и переверни</p></div>
                    <div class="mode-card" id="btn-start-sprint"><span class="mode-icon">⚡</span><h3>Спринт</h3><p>На скорость: верно или нет?</p></div>
                    <div class="mode-card" id="btn-start-builder"><span class="mode-icon">🧩</span><h3>Собери слово</h3><p>Составь слово из букв</p></div>
                </div>
            </div>
            <div id="game-area" class="game-container"></div>
        `;

        try {
            const res = await fetch(`${API}/words?lang=en`);
            let allWords = await res.json();
            allWords = allWords.sort(() => Math.random() - 0.5);

            if (allWords.length < 5) {
                container.innerHTML += `<p style="color:orange; margin-top:20px;">⚠️ В словаре мало слов для игр.</p>`;
                return;
            }

            document.getElementById('btn-start-quiz').onclick = () => this.startQuiz(allWords);
            document.getElementById('btn-start-flashcards').onclick = () => this.startFlashcards(allWords);
            document.getElementById('btn-start-sprint').onclick = () => this.startSprint(allWords);
            document.getElementById('btn-start-builder').onclick = () => this.startWordBuilder(allWords);
        } catch (e) {
            console.error(e);
        }
    },

    quitGame() {
        if (this.sprintInterval) clearInterval(this.sprintInterval);
        this.renderTraining(document.getElementById('content-area'));
    },

    // --- GAME 1: QUIZ ---
    startQuiz(words) {
        document.getElementById('training-menu').style.display = 'none';
        const gameArea = document.getElementById('game-area');
        gameArea.style.display = 'block';
        gameArea.innerHTML = '';

        let score = 0;
        let qCount = 0;
        const maxQuestions = 10; 

        const nextQ = () => {
            if (qCount >= maxQuestions) { this.showGameOver(score, maxQuestions * 20, gameArea); return; }
            qCount++;
            const correct = words[Math.floor(Math.random() * words.length)];
            const distractors = [];
            while(distractors.length < 3) {
                const w = words[Math.floor(Math.random() * words.length)];
                if (w.word !== correct.word && !distractors.includes(w)) distractors.push(w);
            }
            const options = [correct, ...distractors].sort(() => Math.random() - 0.5);

            gameArea.innerHTML = `
                <div class="game-header"><button class="back-btn" id="quit-btn">Выход</button><span>${qCount}/${maxQuestions}</span></div>
                <div class="quiz-word">${correct.word}</div>
                <div class="quiz-options">${options.map(opt => `<button class="quiz-btn" data-id="${opt.word_id}">${opt.translation_ru}</button>`).join('')}</div>
            `;
            document.getElementById('quit-btn').onclick = () => this.quitGame();

            gameArea.querySelectorAll('.quiz-btn').forEach(btn => {
                btn.onclick = (e) => {
                    gameArea.querySelectorAll('.quiz-btn').forEach(b => b.disabled = true);
                    const id = parseInt(e.target.getAttribute('data-id'));
                    if (id === correct.word_id) {
                        e.target.style.background = '#d4edda'; score += 20;
                    } else {
                        e.target.style.background = '#f8d7da';
                        [...gameArea.querySelectorAll('.quiz-btn')].find(b => parseInt(b.getAttribute('data-id')) === correct.word_id).style.background = '#d4edda';
                    }
                    setTimeout(nextQ, 1000);
                };
            });
        };
        nextQ();
    },

    // --- GAME 2: FLASHCARDS ---
    startFlashcards(words) {
        document.getElementById('training-menu').style.display = 'none';
        const gameArea = document.getElementById('game-area');
        gameArea.style.display = 'block';
        let index = 0;
        const sessionWords = [...words].slice(0, 15);

        const renderCard = () => {
            if (index >= sessionWords.length) { this.quitGame(); return; }
            const word = sessionWords[index];
            gameArea.innerHTML = `
                <div class="game-header"><button class="back-btn" id="quit-btn">Выход</button><span>${index + 1}/${sessionWords.length}</span></div>
                <div class="flashcard" id="card"><div id="card-content">${word.word}</div><div class="flashcard-hint">Нажми</div></div>
                <div class="fc-controls"><button class="fc-btn unknow" id="btn-unknow">Не знаю</button><button class="fc-btn know" id="btn-know">Знаю</button></div>
            `;
            document.getElementById('quit-btn').onclick = () => this.quitGame();
            const card = document.getElementById('card');
            let isEng = true;
            card.onclick = () => {
                card.classList.toggle('flipped'); isEng = !isEng;
                document.getElementById('card-content').innerText = isEng ? word.word : word.translation_ru;
            };
            const next = () => { index++; renderCard(); };
            document.getElementById('btn-unknow').onclick = next;
            document.getElementById('btn-know').onclick = next;
        };
        renderCard();
    },

    // --- GAME 3: SPRINT ---
    startSprint(words) {
        document.getElementById('training-menu').style.display = 'none';
        const gameArea = document.getElementById('game-area');
        gameArea.style.display = 'block';
        let score = 0;
        let timeLeft = 60;
        if (this.sprintInterval) clearInterval(this.sprintInterval);

        const renderFrame = () => {
            const correct = words[Math.floor(Math.random() * words.length)];
            const showCorrect = Math.random() > 0.5;
            let shownTrans = correct.translation_ru;
            if (!showCorrect) shownTrans = words[Math.floor(Math.random() * words.length)].translation_ru;

            gameArea.innerHTML = `
                <div class="game-header"><button class="back-btn" id="quit-btn">Выход</button><span>Очки: ${score}</span></div>
                <div class="timer-bar"><div class="timer-fill" style="width: ${(timeLeft/60)*100}%"></div></div>
                <div class="sprint-word">${correct.word}</div>
                <div class="sprint-translation">${shownTrans}</div>
                <div class="sprint-controls"><button class="sprint-btn false" id="btn-false">Неверно</button><button class="sprint-btn true" id="btn-true">Верно</button></div>
            `;
            document.getElementById('quit-btn').onclick = () => this.quitGame();
            const check = (val) => {
                if (val === showCorrect) score += 10; else score = Math.max(0, score - 5);
                renderFrame();
            };
            document.getElementById('btn-true').onclick = () => check(true);
            document.getElementById('btn-false').onclick = () => check(false);
        };
        renderFrame();
        this.sprintInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                clearInterval(this.sprintInterval);
                this.showGameOver(score, 1000, gameArea);
            } else {
                const bar = document.querySelector('.timer-fill');
                if(bar) bar.style.width = `${(timeLeft/60)*100}%`;
            }
        }, 1000);
    },

    // --- GAME 4: WORD BUILDER ---
    startWordBuilder(words) {
        document.getElementById('training-menu').style.display = 'none';
        const gameArea = document.getElementById('game-area');
        gameArea.style.display = 'block';
        let round = 0, score = 0; const maxRounds = 10;

        const nextWord = () => {
            if (round >= maxRounds) { this.showGameOver(score, maxRounds * 20, gameArea); return; }
            round++;
            let wordObj = words[Math.floor(Math.random() * words.length)];
            while (wordObj.word.length < 3) wordObj = words[Math.floor(Math.random() * words.length)];
            const target = wordObj.word.toLowerCase();
            const letters = target.split('').sort(() => Math.random() - 0.5);
            let guess = [];

            const render = () => {
                let result = '';
                if (guess.length === target.length) {
                    if (guess.join('') === target) {
                        result = '<p style="color:green">✅ Верно!</p>'; score += 20; setTimeout(nextWord, 800);
                    } else {
                        result = '<p style="color:red">❌ Ошибка</p>'; setTimeout(() => { guess = []; render(); }, 800);
                    }
                }

                gameArea.innerHTML = `
                    <div class="game-header"><button class="back-btn" id="quit-btn">Выход</button><span>${round}/${maxRounds}</span></div>
                    <div class="wb-target">${wordObj.translation_ru}</div>
                    <div class="wb-slots">${Array(target.length).fill(0).map((_, i) => `<div class="wb-slot">${guess[i] || ''}</div>`).join('')}</div>
                    ${result}
                    <div class="wb-letters">${letters.map(char => {
                        const used = guess.filter(c => c === char).length >= letters.filter(c => c === char && letters.indexOf(c) <= letters.lastIndexOf(char)).length; 
                        // Simplified usage check for this demo
                        return `<button class="wb-letter-btn" data-char="${char}">${char}</button>`;
                    }).join('')}</div>
                    <button class="back-btn" id="reset-btn" style="margin-top:20px; color:orange">Сброс</button>
                `;
                document.getElementById('quit-btn').onclick = () => this.quitGame();
                document.getElementById('reset-btn').onclick = () => { guess = []; render(); };
                
                // Logic for buttons (simplified)
                gameArea.querySelectorAll('.wb-letter-btn').forEach(btn => {
                    btn.onclick = () => {
                        if (guess.length < target.length) {
                            guess.push(btn.getAttribute('data-char')); render();
                        }
                    }
                });
            };
            render();
        };
        nextWord();
    },

    showGameOver(score, total, container) {
        if (score > 0) this.fireConfetti();
        container.innerHTML = `
            <div class="result-modal">
                <span class="result-emoji-big">🏆</span>
                <div class="result-header">Финиш!</div>
                <div class="score-circle" style="border-color:#2ecc71; color:#2ecc71">
                    <span class="score-val">${score}</span><span class="score-label">Очков</span>
                </div>
                <div class="result-btns"><button class="primary-btn" onclick="app.renderTraining(document.getElementById('content-area'))">Дальше</button></div>
            </div>`;
    },

    fireConfetti() {
        const colors = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71'];
        for (let i = 0; i < 50; i++) {
            const c = document.createElement('div');
            c.className = 'confetti';
            c.style.left = Math.random() * 100 + 'vw';
            c.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            c.style.animationDuration = (Math.random() * 2 + 2) + 's';
            document.body.appendChild(c);
            setTimeout(() => c.remove(), 4000);
        }
    }
};

document.addEventListener('DOMContentLoaded', () => auth.init());
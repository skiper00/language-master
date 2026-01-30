const API_URL = 'http://localhost:3000/api';

const app = {
    currentLang: 'en',
    interfaceLang: 'ru',
    currentTab: 'home',
    completedLessons: JSON.parse(localStorage.getItem('doneLessons')) || [],
    streak: 0,

    // Состояние
    currentLevel: 'A1',
    lastScroll: 0,
    totalLessonsCount: 0, // Храним общее кол-во уроков для статистики

    translations: {
        ru: {
            home: 'Главная', lessons: 'Уроки', dictionary: 'Словарь', quiz: 'Тренировка',
            back: '← Назад', search: 'Поиск слова...',
            streak: 'Дней в ударе',
            statusDone: '✅ Пройдено', statusNotDone: '⭕ Не пройдено'
        },
        en: {
            home: 'Home', lessons: 'Lessons', dictionary: 'Dictionary', quiz: 'Quiz',
            back: '← Back', search: 'Search word...',
            streak: 'Day Streak',
            statusDone: '✅ Completed', statusNotDone: '⭕ Not started'
        }
    },

    init() {
        this.calculateStreak();
        // Предзагрузка кол-ва уроков для статистики
        this.fetchTotalLessons();

        const langSelect = document.getElementById('lang-switch');
        if (langSelect) {
            langSelect.addEventListener('change', (e) => {
                this.interfaceLang = e.target.value;
                this.updateMenu();
                this.renderCurrentTab();
            });
        }
        this.updateMenu();
        this.switchTab('home');
    },

    async fetchTotalLessons() {
        try {
            const res = await fetch(`${API_URL}/lessons?lang=en`);
            const lessons = await res.json();
            this.totalLessonsCount = lessons.length; // Всего уроков в базе
            // Можно также посчитать отдельно по уровням, если нужно
        } catch (e) {
            console.error(e);
        }
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
                // Если зашли в тот же день, не меняем. Если пропуск - сброс
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
        ['home', 'lessons', 'dictionary', 'quiz'].forEach(id => {
            const btn = document.getElementById(`btn-${id}`);
            if (btn) {
                const span = btn.querySelector('span');
                if (span) span.innerText = t[id];
            }
        });
    },

    switchTab(tabName) {
        if (this.currentTab === 'lessons' && tabName !== 'lessons') {
            this.lastScroll = 0;
        }
        this.currentTab = tabName;
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const activeBtn = document.getElementById(`btn-${tabName}`);
        if (activeBtn) activeBtn.classList.add('active');
        this.renderCurrentTab();
    },

    async renderCurrentTab() {
        const area = document.getElementById('content-area');
        if (!area) return;
        area.innerHTML = '';

        if (this.currentTab === 'home') this.renderHome(area);
        else if (this.currentTab === 'lessons') this.renderLevels(area);
        else if (this.currentTab === 'dictionary') this.renderDictionary(area);
        else if (this.currentTab === 'quiz') this.renderTraining(area);
    },

    // --- ИСПРАВЛЕННАЯ СТАТИСТИКА ---
renderHome(container) {
        const t = this.translations[this.interfaceLang];
        const total = this.totalLessonsCount || 150; 
        const doneCount = this.completedLessons.length;
        const progress = Math.min(100, Math.round((doneCount / total) * 100));

        container.innerHTML = `
            <div class="dashboard-container">
                <div class="hero-banner">
                    <div>
                        <h1>Привет, Полиглот! 🎓</h1>
                        <p>Ты уже прошел <b>${doneCount}</b> уроков. Продолжай в том же духе, и ты достигнешь цели!</p>
                        <button class="hero-btn" onclick="app.switchTab('lessons')">Продолжить обучение →</button>
                    </div>
                </div>

                <div class="stats-grid">
                    <div class="stat-box">
                        <div class="stat-icon fire">🔥</div>
                        <div class="stat-info">
                            <h2>${this.streak}</h2>
                            <p>${t.streak}</p>
                        </div>
                    </div>
                    
                    <div class="stat-box">
                        <div class="stat-icon trophy">🏆</div>
                        <div class="stat-info">
                            <h2>${progress}%</h2>
                            <p>Пройдено курса</p>
                        </div>
                    </div>

                    <div class="stat-box">
                        <div class="stat-icon bolt">⚡</div>
                        <div class="stat-info">
                            <h2>${this.currentLevel}</h2>
                            <p>Текущий уровень</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
    },

    async renderLevels(container) {
        const t = this.translations[this.interfaceLang];
        container.innerHTML = `<h2>${t.lessons}</h2><div id="levels-nav"></div><div id="lessons-list"></div>`;
        const nav = document.getElementById('levels-nav');

        const res = await fetch(`${API_URL}/lessons?lang=en`);
        const lessons = await res.json();
        // Обновляем точное число уроков
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
                <div style="display:flex; justify-content:space-between; align-items:center;">
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
        const res = await fetch(`${API_URL}/lessons/${id}`);
        const data = await res.json();
        const lesson = data.lesson;
        const tasks = data.tasks || [];
        const t = this.translations[this.interfaceLang];

        const isDone = this.completedLessons.includes(lesson.lesson_id);

        let videoHTML = '';
        if (lesson.video_url) {
            videoHTML = `
                <div class="video-container">
                    <iframe src="${lesson.video_url}" frameborder="0" allowfullscreen></iframe>
                </div>`;
        }

        // --- НОВАЯ КНОПКА СТАТУСА (СВЕРХУ) ---
        const statusBtn = `
            <button class="status-toggle ${isDone ? 'done' : ''}" onclick="app.toggleLessonStatus(${lesson.lesson_id}, this)">
                ${isDone ? t.statusDone : t.statusNotDone}
            </button>
        `;

        document.getElementById('content-area').innerHTML = `
            <button onclick="app.switchTab('lessons')" class="back-btn">${t.back}</button>
            
            <div class="lesson-header">
                <h1>${lesson.title_ru}</h1>
                ${statusBtn}
            </div>
            
            <div class="theory-box">
                ${lesson.theory_content}
            </div>

            ${videoHTML} 
            
            <div class="practice-section">
                <h2>Практика</h2>
                <div id="tasks-wrapper">
                    ${tasks.map((task, index) => this.renderTaskHTML(task, index)).join('')}
                </div>
            </div>
        `;

        const main = document.querySelector('.main-content');
        if (main) main.scrollTop = 0;
    },

    // --- НОВАЯ ЛОГИКА: ВКЛЮЧИТЬ/ВЫКЛЮЧИТЬ УРОК ---
    toggleLessonStatus(id, btnElement) {
        const t = this.translations[this.interfaceLang];

        if (this.completedLessons.includes(id)) {
            // Если урок был пройден -> удаляем (снимаем галочку)
            this.completedLessons = this.completedLessons.filter(lessonId => lessonId !== id);
            btnElement.classList.remove('done');
            btnElement.innerText = t.statusNotDone;
        } else {
            // Если не пройден -> добавляем
            this.completedLessons.push(id);
            btnElement.classList.add('done');
            btnElement.innerText = t.statusDone;
        }
        // Сохраняем в память
        localStorage.setItem('doneLessons', JSON.stringify(this.completedLessons));
    },

    renderTaskHTML(task, index) {
        // ... (Код генерации заданий без изменений, как в прошлом ответе) ...
        // Для краткости не дублирую, используй функцию из прошлого ответа или оставь как есть
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
                <div class="input-group">
                    <input type="text" class="task-input" placeholder="..." id="input_${task.task_id}">
                    <button class="check-btn" onclick="app.checkInput(${task.task_id}, '${task.correct_answer}')">OK</button>
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

    // --- ИСПРАВЛЕННЫЙ СЛОВАРЬ (С ФИЛЬТРОМ) ---
    async renderDictionary(container) {
        const t = this.translations[this.interfaceLang];

        container.innerHTML = `
            <h1>${t.dictionary}</h1>
            <div class="dict-controls">
                <input type="text" id="dict-search" class="search-box" placeholder="${t.search}" style="flex:1; margin-bottom:0">
                <select id="dict-level-filter" class="dict-filter">
                    <option value="ALL">Все уровни</option>
                    <option value="A1">Только A1</option>
                    <option value="A2">Только A2</option>
                    <option value="B1">Только B1</option>
                    <option value="B2">Только B2</option>
                    <option value="C1">Только C1</option></select>
                </select>
            </div>
            <div id="words-grid" class="words-grid"></div>
        `;

        const res = await fetch(`${API_URL}/words?lang=en`);
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

            grid.innerHTML = filtered
                .map(w => `
                    <div class="word-card">
                        <b>${w.word}</b> <span style="font-size:0.8em; color:#bdc3c7; border:1px solid #eee; padding:2px 5px; border-radius:4px">${w.level_code}</span><br>
                        <small>${w.translation_ru}</small>
                    </div>`)
                .join('');
        };

        draw();
        searchInput.oninput = draw;
        levelSelect.onchange = draw;
    },



    // --- ГЛАВНОЕ МЕНЮ ТРЕНИРОВОК ---
    async renderTraining(container) {
        const t = this.translations[this.interfaceLang];

        container.innerHTML = `
            <div id="training-menu">
                <h1>${t.quiz || 'Тренировка'}</h1>
                <p style="color:#7f8c8d">Выберите режим обучения:</p>
                
                <div class="modes-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: 20px; margin-top: 20px;">
                    
                    <div class="mode-card" id="btn-start-quiz" style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); cursor: pointer; text-align: center;">
                        <span style="font-size: 3em; display: block; margin-bottom: 10px;">❓</span>
                        <h3>Викторина</h3>
                        <p>Выберите правильный перевод</p>
                    </div>

                    <div class="mode-card" id="btn-start-flashcards" style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); cursor: pointer; text-align: center;">
                        <span style="font-size: 3em; display: block; margin-bottom: 10px;">🃏</span>
                        <h3>Карточки</h3>
                        <p>Вспомни и переверни</p>
                    </div>

                    <div class="mode-card" id="btn-start-sprint" style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); cursor: pointer; text-align: center;">
                        <span style="font-size: 3em; display: block; margin-bottom: 10px;">⚡</span>
                        <h3>Спринт</h3>
                        <p>На скорость: верно или нет?</p>
                    </div>

                    <div class="mode-card" id="btn-start-builder" style="background: white; padding: 20px; border-radius: 12px; box-shadow: 0 2px 5px rgba(0,0,0,0.1); cursor: pointer; text-align: center;">
                        <span style="font-size: 3em; display: block; margin-bottom: 10px;">🧩</span>
                        <h3>Собери слово</h3>
                        <p>Составь слово из букв</p>
                    </div>

                </div>
            </div>

            <div id="game-area" class="game-container" style="display: none;"></div>
        `;

        try {
            // Загружаем слова (фильтруем только те, где есть перевод)
            const res = await fetch(`${API_URL}/words?lang=en`);
            let allWords = await res.json();
            
            // Перемешиваем массив слов для случайности
            allWords = allWords.sort(() => Math.random() - 0.5);

            if (allWords.length < 5) {
                container.innerHTML += `<p style="color:orange; margin-top:20px;">⚠️ В словаре мало слов для игр. Добавьте больше слов в словарь!</p>`;
                return;
            }

            // Вешаем обработчики
            document.getElementById('btn-start-quiz').onclick = () => this.startQuiz(allWords);
            document.getElementById('btn-start-flashcards').onclick = () => this.startFlashcards(allWords);
            document.getElementById('btn-start-sprint').onclick = () => this.startSprint(allWords);
            document.getElementById('btn-start-builder').onclick = () => this.startWordBuilder(allWords);

        } catch (e) {
            console.error(e);
            container.innerHTML = `<p style="color:red">Ошибка загрузки слов. Проверьте сервер.</p>`;
        }
    },

    // --- ОБЩАЯ ФУНКЦИЯ ВЫХОДА (ИСПРАВЛЕННАЯ) ---
    quitGame() {
        // Останавливаем любые таймеры, если они есть (для Спринта)
        if (this.sprintInterval) clearInterval(this.sprintInterval);
        
        // Перерисовываем меню в правильный контейнер
        this.renderTraining(document.getElementById('content-area'));
    },


    // --- ИГРА 1: ВИКТОРИНА (QUIZ) ---
  startQuiz(words) {
        if (!words || words.length < 4) { alert("Мало слов!"); return; }

        document.getElementById('training-menu').style.display = 'none';
        const gameArea = document.getElementById('game-area');
        gameArea.style.display = 'block';
        gameArea.innerHTML = ''; // Очистка перед стартом

        let score = 0;
        let qCount = 0;
        const maxQuestions = 20; 

        const nextQ = () => {
            if (qCount >= maxQuestions) {
                this.showGameOver(score, maxQuestions, gameArea);
                return;
            }

            qCount++;
            const correct = words[Math.floor(Math.random() * words.length)];
            const distractors = [];
            while(distractors.length < 3) {
                const w = words[Math.floor(Math.random() * words.length)];
                if (w.word !== correct.word && !distractors.includes(w)) distractors.push(w);
            }
            const options = [correct, ...distractors].sort(() => Math.random() - 0.5);

            gameArea.innerHTML = `
                <div class="game-header">
                    <button class="back-btn" id="quit-btn">← Выход</button>
                    <span>Вопрос: ${qCount} / ${maxQuestions}</span>
                    <span style="font-weight:bold; color:#2ecc71">Счет: ${score}</span>
                </div>
                <div class="quiz-word">${correct.word}</div>
                <div class="quiz-options">
                    ${options.map(opt => `<button class="quiz-btn" data-id="${opt.word_id}">${opt.translation_ru}</button>`).join('')}
                </div>
            `;

            document.getElementById('quit-btn').onclick = () => this.quitGame();

            gameArea.querySelectorAll('.quiz-btn').forEach(btn => {
                btn.onclick = (e) => {
                    gameArea.querySelectorAll('.quiz-btn').forEach(b => b.disabled = true);
                    const id = parseInt(e.target.getAttribute('data-id'));
                    
                    if (id === correct.word_id) {
                        e.target.style.background = '#d4edda';
                        e.target.style.borderColor = '#28a745';
                        score += 20; // <--- ОБНОВЛЕНО: +20
                    } else {
                        e.target.style.background = '#f8d7da';
                        e.target.style.borderColor = '#dc3545';
                        score = Math.max(0, score - 10); // <--- ОБНОВЛЕНО: -10
                        
                        // Подсвечиваем правильный
                        [...gameArea.querySelectorAll('.quiz-btn')].find(b => parseInt(b.getAttribute('data-id')) === correct.word_id).style.background = '#d4edda';
                    }
                    setTimeout(nextQ, 1000);
                };
            });
        };
        nextQ();
    },


    // --- ИГРА 2: КАРТОЧКИ (FLASHCARDS) ---
    startFlashcards(words) {
        document.getElementById('training-menu').style.display = 'none';
        const gameArea = document.getElementById('game-area');
        gameArea.style.display = 'block';

        let index = 0;
        // Берем перемешанный список
        const sessionWords = [...words].slice(0, 20); // Ограничим сессию 20 словами

        const renderCard = () => {
            if (index >= sessionWords.length) {
                gameArea.innerHTML = `<h2>Сессия окончена! 🎉</h2><button class="action-btn" id="quit-btn">В меню</button>`;
                document.getElementById('quit-btn').onclick = () => this.quitGame();
                return;
            }

            const word = sessionWords[index];

            gameArea.innerHTML = `
                <div class="game-header">
                    <button class="back-btn" id="quit-btn">← Закончить</button>
                    <span>${index + 1} / ${sessionWords.length}</span>
                </div>
                
                <div class="flashcard" id="card">
                    <div id="card-content">${word.word}</div>
                    <div class="flashcard-hint">Нажми, чтобы перевернуть</div>
                </div>

                <div class="fc-controls">
                    <button class="fc-btn unknow" id="btn-unknow">Не знаю 😕</button>
                    <button class="fc-btn know" id="btn-know">Знаю 😎</button>
                </div>
            `;

            document.getElementById('quit-btn').onclick = () => this.quitGame();

            const card = document.getElementById('card');
            let isEnglish = true;

            // Переворот карточки
            card.onclick = () => {
                card.classList.toggle('flipped');
                isEnglish = !isEnglish;
                document.getElementById('card-content').innerText = isEnglish ? word.word : word.translation_ru;
            };

            // Логика кнопок
            const next = () => { index++; renderCard(); };
            document.getElementById('btn-unknow').onclick = next;
            document.getElementById('btn-know').onclick = next;
        };

        renderCard();
    },


    // --- ИГРА 3: СПРИНТ (SPRINT) ---
    startSprint(words) {
        document.getElementById('training-menu').style.display = 'none';
        const gameArea = document.getElementById('game-area');
        gameArea.style.display = 'block';

        let score = 0;
        let timeLeft = 60;
        
        // Создаем интервал
        if (this.sprintInterval) clearInterval(this.sprintInterval);

        const renderFrame = () => {
            // Выбираем слово
            const correct = words[Math.floor(Math.random() * words.length)];
            // 50% шанс показать правильный перевод, 50% неправильный
            const showCorrect = Math.random() > 0.5;
            let shownTranslation = correct.translation_ru;

            if (!showCorrect) {
                const randomWrong = words[Math.floor(Math.random() * words.length)];
                shownTranslation = randomWrong.translation_ru;
            }

            gameArea.innerHTML = `
                <div class="game-header">
                    <button class="back-btn" id="quit-btn">← Выход</button>
                    <span>Счет: ${score}</span>
                </div>
                <div class="timer-bar"><div class="timer-fill" style="width: ${(timeLeft/60)*100}%"></div></div>
                <div style="font-size:3em; margin: 10px 0;">⏱ ${timeLeft}</div>
                
                <div class="sprint-word">${correct.word}</div>
                <div class="sprint-translation">${shownTranslation}</div>

                <div class="sprint-controls">
                    <button class="sprint-btn false" id="btn-false">Неверно</button>
                    <button class="sprint-btn true" id="btn-true">Верно</button>
                </div>
            `;

            document.getElementById('quit-btn').onclick = () => this.quitGame();

            const check = (userChoice) => {
                if (userChoice === showCorrect) score += 10; // +10 очков за правильный ответ
                else score = Math.max(0, score - 5); // Штраф
                renderFrame();
            };

            document.getElementById('btn-true').onclick = () => check(true);
            document.getElementById('btn-false').onclick = () => check(false);
        };

        renderFrame();

        // Запуск таймера
        this.sprintInterval = setInterval(() => {
            timeLeft--;
            if (timeLeft <= 0) {
                clearInterval(this.sprintInterval);
                gameArea.innerHTML = `
                    <h2>Время вышло! 🏁</h2>
                    <p style="font-size:2em; margin:20px;">Твой счет: <b>${score}</b></p>
                    <button class="action-btn" onclick="app.quitGame()">В меню</button>
                `;
            } else {
                const bar = document.querySelector('.timer-fill');
                const num = document.querySelector('.game-container div[style*="font-size:3em"]');
                if(bar) bar.style.width = `${(timeLeft/60)*100}%`;
                if(num) num.innerText = `⏱ ${timeLeft}`;
            }
        }, 1000);
    },

showGameOver(score, total, container) {
        // Запускаем конфетти если результат хороший
        if (score > 0) this.fireConfetti();

        // Подбираем эмодзи и текст
        let title = 'Хорошо!';
        let emoji = '👍';
        let color = '#f1c40f'; // Yellow

        if (score >= total * 20 * 0.8) { // Если набрал 80% от максимума (20 очков * кол-во)
            title = 'Потрясающе!';
            emoji = '🏆';
            color = '#2ecc71'; // Green
        } else if (score <= 0) {
            title = 'Не сдавайся!';
            emoji = '🥺';
            color = '#e74c3c'; // Red
        }

        // Вместо полной очистки, добавляем оверлей поверх игры
        const overlay = document.createElement('div');
        overlay.className = 'game-over-overlay';
        overlay.innerHTML = `
            <div class="result-modal">
                <span class="result-emoji-big">${emoji}</span>
                <div class="result-header">${title}</div>
                <div class="result-sub">Тренировка завершена</div>
                
                <div class="score-circle" style="border-color: ${color}; color: ${color}">
                    <span class="score-val">${score}</span>
                    <span class="score-label">Очков</span>
                </div>

                <div class="result-btns">
                    <button class="btn-primary" onclick="app.renderTraining(document.getElementById('content-area'))">Играть снова</button>
                    <button class="btn-secondary" onclick="app.switchTab('home')">На главную</button>
                </div>
            </div>
        `;
        
        container.appendChild(overlay);
    },

    fireConfetti() {
        const colors = ['#e74c3c', '#3498db', '#f1c40f', '#2ecc71', '#9b59b6'];
        for (let i = 0; i < 100; i++) {
            const confetti = document.createElement('div');
            confetti.classList.add('confetti');
            confetti.style.left = Math.random() * 100 + 'vw';
            confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            confetti.style.animationDuration = (Math.random() * 3 + 2) + 's';
            confetti.style.opacity = Math.random();
            document.body.appendChild(confetti);

            // Удаляем элементы после анимации
            setTimeout(() => confetti.remove(), 5000);
        }
    },


    // --- ИГРА 4: СОБЕРИ СЛОВО (WORD BUILDER) ---
startWordBuilder(words) {
        document.getElementById('training-menu').style.display = 'none';
        const gameArea = document.getElementById('game-area');
        gameArea.style.display = 'block';
        gameArea.innerHTML = '';

        let round = 0;
        let score = 0; 
        const maxRounds = 20;

        const nextWord = () => {
            if (round >= maxRounds) {
                this.showGameOver(score, maxRounds, gameArea);
                return;
            }
            round++;

            let wordObj = words[Math.floor(Math.random() * words.length)];
            while (wordObj.word.length < 3) {
                wordObj = words[Math.floor(Math.random() * words.length)];
            }

            const targetWord = wordObj.word.toLowerCase();
            const letters = targetWord.split('').sort(() => Math.random() - 0.5);
            let currentGuess = [];

            const render = () => {
                const isComplete = currentGuess.length === targetWord.length;
                let checkResult = '';
                
                if (isComplete) {
                    if (currentGuess.join('') === targetWord) {
                        checkResult = '<p style="color:green; font-weight:bold;">✅ Верно! (+20)</p>';
                        score += 20; // <--- ОБНОВЛЕНО
                        setTimeout(nextWord, 1000);
                    } else {
                        checkResult = '<p style="color:red; font-weight:bold;">❌ Ошибка (-10)</p>';
                        score = Math.max(0, score - 10); // <--- ОБНОВЛЕНО
                        setTimeout(() => { currentGuess = []; render(); }, 1000);
                    }
                }

                gameArea.innerHTML = `
                    <div class="game-header">
                        <button class="back-btn" id="quit-btn">← Выход</button>
                        <span>${round} / ${maxRounds}</span>
                        <span style="font-weight:bold; color:#2ecc71">Счет: ${score}</span>
                    </div>

                    <div class="wb-target" style="font-size: 1.8em; margin: 20px 0;">${wordObj.translation_ru}</div>

                    <div class="wb-slots">
                        ${Array(targetWord.length).fill(0).map((_, i) => 
                            `<div class="wb-slot">${currentGuess[i] || ''}</div>`
                        ).join('')}
                    </div>

                    ${checkResult}

                    <div class="wb-letters">
                        ${letters.map((char, i) => {
                            const charCountInGuess = currentGuess.filter(c => c === char).length;
                            const charCountInPool = letters.filter((c, idx) => c === char && idx <= i).length;
                            const isUsed = charCountInGuess >= charCountInPool;
                            return `<button class="wb-letter-btn ${isUsed ? 'used' : ''}" data-char="${char}">${char}</button>`;
                        }).join('')}
                    </div>
                    
                    <div style="margin-top: 20px;">
                        <button class="back-btn" id="reset-btn" style="color:orange;">↺ Сброс</button>
                    </div>
                `;

                document.getElementById('quit-btn').onclick = () => this.quitGame();
                document.getElementById('reset-btn').onclick = () => { currentGuess = []; render(); };

                gameArea.querySelectorAll('.wb-letter-btn').forEach(btn => {
                    btn.onclick = () => {
                        if (!btn.classList.contains('used') && currentGuess.length < targetWord.length) {
                            currentGuess.push(btn.getAttribute('data-char'));
                            render();
                        }
                    };
                });
            };
            render();
        };
        nextWord();
    },
};

document.addEventListener('DOMContentLoaded', () => app.init());
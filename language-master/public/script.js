const API = '/api';

// ============================================================
// 1. МОДУЛЬ АВТОРИЗАЦИИ (AUTH)
// ============================================================
const auth = {
    token: localStorage.getItem('token'),
    user: JSON.parse(localStorage.getItem('user')) || null,

    init() {
        setTimeout(() => {
            const splash = document.getElementById('splash-screen');
            if (splash) {
                splash.style.opacity = 0;
                setTimeout(() => {
                    splash.style.display = 'none';
                    if (this.token && this.user) app.start(this.user);
                    else document.getElementById('auth-screen').style.display = 'flex';
                }, 500);
            }
        }, 2000);

        const loginForm = document.getElementById('login-form');
        if (loginForm) loginForm.onsubmit = this.handleLogin.bind(this);

        const regForm = document.getElementById('register-form');
        if (regForm) regForm.onsubmit = this.handleRegister.bind(this);
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
    },

    // Добавь это ВНУТРЬ объекта auth, после logout()
    async deleteAccount() {
        const pass = prompt("⚠️ Внимание!\nВы собираетесь удалить свой аккаунт и весь прогресс.\n\nВведите свой пароль для подтверждения:");
        
        if (!pass) return; // Нажал отмену

        try {
            const res = await fetch(`${API}/user`, {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: this.user.id, password: pass })
            });

            const data = await res.json();

            if (data.success) {
                alert('Аккаунт удален. Жаль, что вы уходите!');
                this.logout(); // Выходим из системы
            } else {
                alert('Ошибка: ' + data.error);
            }
        } catch (e) {
            alert('Ошибка соединения с сервером');
        }
    },
};

const ui = {
    showRegister: () => {
        document.getElementById('login-form').style.display = 'none';
        document.getElementById('register-form').style.display = 'block';
        document.getElementById('auth-title').innerText = 'Регистрация';
    },
    showLogin: () => {
        document.getElementById('register-form').style.display = 'none';
        document.getElementById('login-form').style.display = 'block';
        document.getElementById('auth-title').innerText = 'Вход в систему';
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
    completedLessons: [],
    streak: 0,
    currentLevel: 'A1',
    lastScroll: 0,
    totalLessonsCount: 0,
    currentTasks: [],      // Храним задачи здесь, чтобы проверить их в конце
    userAnswers: {},       // Ответы пользователя { taskId: 'ответ' }
    currentLessonId: null,

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

    async start(user) {
        this.user = user;
        document.getElementById('app-container').style.display = 'flex';

        document.getElementById('user-name-display').innerText = user.name;
        document.getElementById('user-id-display').innerText = `ID: ${user.id}`;

        // Загружаем аватарку при старте
        this.updateSidebarAvatar();

        const langSelect = document.getElementById('lang-switch');
        if (langSelect) {
            langSelect.addEventListener('change', (e) => {
                this.interfaceLang = e.target.value;
                this.updateMenu();
                this.tab(this.currentTab);
            });
        }
        this.updateMenu();

        if (user.role === 'teacher') {
            document.getElementById('student-nav').style.display = 'none';
            document.getElementById('teacher-nav').style.display = 'block';
            this.tab('dashboard'); // Сразу открываем дашборд
        } else {
            document.getElementById('student-nav').style.display = 'block';
            document.getElementById('teacher-nav').style.display = 'none';
            await this.loadProgress();
            this.calculateStreak();
            this.fetchTotalLessons();
            this.tab('home');
        }
    },

    speak(text) {
        window.speechSynthesis.cancel();
        const msg = new SpeechSynthesisUtterance(text);
        msg.lang = 'en-US';
        msg.rate = 0.9;
        window.speechSynthesis.speak(msg);
    },

    async loadProgress() {
        try {
            const res = await fetch(`${API}/progress/${this.user.id}`);
            const ids = await res.json();
            this.completedLessons = ids;
        } catch (e) { console.error(e); }
    },

    async fetchTotalLessons() {
        try {
            const res = await fetch(`${API}/lessons?lang=en`);
            const lessons = await res.json();
            this.allLessons = lessons; // Сохраняем весь массив уроков
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
                if (lastDate !== null) currentStreak = 1;
            }
            localStorage.setItem('lastLoginDate', today);
            localStorage.setItem('streak', currentStreak);
        }
        this.streak = currentStreak;
    },

    updateMenu() {
        const t = this.translations[this.interfaceLang];
        // ... (твой старый код перевода кнопок) ...

        // --- ДОБАВЛЯЕМ КНОПКУ УДАЛЕНИЯ (Если её еще нет) ---
        const sidebarFooter = document.querySelector('.sidebar-footer'); 
        // Если у тебя нет footer, ищем просто sidebar
        const sidebar = document.querySelector('.sidebar') || document.getElementById('sidebar');

        if (sidebar && !document.getElementById('btn-delete-acc')) {
            const btn = document.createElement('button');
            btn.id = 'btn-delete-acc';
            btn.className = 'nav-btn'; // Или любой другой класс стиля
            btn.style.marginTop = '20px';
            btn.style.color = '#e74c3c'; // Красный цвет
            btn.style.border = '1px solid rgba(231, 76, 60, 0.3)';
            btn.innerHTML = `<i class="fas fa-user-times"></i> <span>Удалить аккаунт</span>`;
            
            btn.onclick = () => auth.deleteAccount();
            
            // Вставляем кнопку в самый низ
            if (sidebarFooter) sidebarFooter.appendChild(btn);
            else sidebar.appendChild(btn);
        }
        
        // Меняем текст кнопки при смене языка
        const delBtn = document.getElementById('btn-delete-acc');
        if (delBtn) {
            const delSpan = delBtn.querySelector('span');
            if (delSpan) delSpan.innerText = this.interfaceLang === 'ru' ? 'Удалить аккаунт' : 'Delete Account';
        }
    },

    tab(tabName) {
        if (this.currentTab === 'lessons' && tabName !== 'lessons') this.lastScroll = 0;
        this.currentTab = tabName;

        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        const activeBtn = document.getElementById(tabName === 'dashboard' ? 'btn-dashboard' : `btn-${tabName}`);
        if (activeBtn) activeBtn.classList.add('active');

        const area = document.getElementById('content-area');
        area.innerHTML = '';

        if (tabName === 'home') this.renderHome(area);
        else if (tabName === 'lessons') this.renderLevels(area);
        else if (tabName === 'dictionary') this.renderDictionary(area);
        else if (tabName === 'quiz') this.renderTraining(area);
        else if (tabName === 'dashboard') this.renderTeacherDashboard(area);
    },

    // ============================================================
    // 3. УЧИТЕЛЬ: ГЛАВНАЯ (АНАЛИТИКА)
    // ============================================================
    async renderHome(container) {
        if (this.user.role === 'teacher') {
            container.innerHTML = `
                <div class="welcome-box" style="background: linear-gradient(135deg, #2c3e50, #4ca1af);">
                    <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                        <div>
                            <h1 style="margin:0">Центр Аналитики 📊</h1>
                            <p style="margin-top:5px; opacity:0.9">Статистика по классам</p>
                        </div>
                        <select id="class-filter" class="class-select" onchange="app.loadTeacherAnalytics()">
                            <option value="ALL">Все классы</option>
                            <option disabled>Загрузка...</option>
                        </select>
                    </div>
                </div>

                <div class="analytics-grid" style="margin-bottom:20px;">
                    <div class="stat-card">
                        <h3>🎓 Распределение</h3>
                        <div class="chart-container">
                            <div class="pie-chart" id="level-chart"></div>
                            <div class="chart-legend" id="level-legend"></div>
                        </div>
                    </div>
                    <div class="stat-card wide">
                        <h3>📈 Активность (7 дней)</h3>
                        <div class="bar-chart-wrap">
                            <div class="bar-chart" id="activity-chart">Загрузка...</div>
                            <div class="chart-axis" id="activity-axis"></div>
                        </div>
                    </div>
                </div>

                <div class="lists-grid">
                    <div class="list-card red">
                        <h3>⚠️ Требуют внимания (< 5) <span id="count-attention">0</span></h3>
                        <div id="attention-list" class="risk-list"></div>
                    </div>
                    <div class="list-card yellow">
                        <h3>⚡ Хорошисты (5-9) <span id="count-mid">0</span></h3>
                        <div id="mid-list" class="risk-list"></div>
                    </div>
                    <div class="list-card green">
                        <h3>🌟 Отличники (10+) <span id="count-top">0</span></h3>
                        <div id="top-list" class="risk-list"></div>
                    </div>
                </div>
            `;
            this.initClassFilter();
        } else {
            // --- ЛОГИКА ДЛЯ УЧЕНИКА ---

            // 1. Загружаем Слово Дня
            let wordOfDay = null;
            try {
                const wRes = await fetch(`${API}/word-of-day`);
                wordOfDay = await wRes.json();
            } catch (e) { console.error(e); }

            // 2. Считаем Прогресс Текущего Грейда
            const currentLevelLessons = (this.allLessons || []).filter(l => l.level_code === this.currentLevel);
            const totalInLevel = currentLevelLessons.length;
            const doneInLevel = currentLevelLessons.filter(l => this.completedLessons.includes(l.lesson_id)).length;
            const progress = totalInLevel > 0 ? Math.round((doneInLevel / totalInLevel) * 100) : 0;
            const isCurrentCompleted = progress === 100 && totalInLevel > 0;

            // 3. Ищем ВСЕ полностью пройденные уровни (для галочек)
            const allLevels = ['A1', 'A2', 'B1', 'B2', 'C1'];
            const passedLevels = [];

            allLevels.forEach(lvl => {
                const lvlLessons = (this.allLessons || []).filter(l => l.level_code === lvl);
                if (lvlLessons.length > 0) {
                    const isAllDone = lvlLessons.every(l => this.completedLessons.includes(l.lesson_id));
                    if (isAllDone) passedLevels.push(lvl);
                }
            });

            // 4. Рисуем HTML
            container.innerHTML = `
                <div class="welcome-box">
                    <h1>Привет, ${this.user.name}! 👋</h1>
                    <p>Твой фокус: <b>${this.currentLevel}</b>. Ты становишься лучше с каждым днем!</p>
                    <button class="primary-btn" style="width:auto; margin-top:15px; background:rgba(255,255,255,0.2)" onclick="app.tab('lessons')">
                        Продолжить обучение
                    </button>
                </div>

                <div class="stats-grid">
                    <div class="stat-box">
                        <div class="stat-icon fire">🔥</div>
                        <div class="stat-info"><h2>${this.streak}</h2><p>Стрик (дней)</p></div>
                    </div>
                    
                    <div class="stat-box ${isCurrentCompleted ? 'level-done' : ''}">
                        <div class="stat-icon trophy">🏆</div>
                        <div class="stat-info">
                            <h2>${progress}%</h2>
                            <p>Прогресс ${this.currentLevel}</p>
                        </div>
                    </div>
                </div>

                <div class="dashboard-extras">
                    
                    <div class="extra-card word-day-card">
                        <div class="card-header-icon">💡 Слово дня</div>
                        ${wordOfDay ? `
                            <div class="wd-word">${wordOfDay.word}</div>
                            <div class="wd-trans">${wordOfDay.translation_ru}</div>
                            <button onclick="app.speak('${wordOfDay.word}')" class="wd-speak-btn">🔊 Слушать</button>
                        ` : '<p>Загрузка...</p>'}
                    </div>

                    <div class="extra-card certs-card">
                        <div class="card-header-icon">🎓 Мои достижения</div>
                        <div class="certs-list">
                            ${passedLevels.length > 0 
                                ? passedLevels.map(lvl => `
                                    <div class="cert-badge">
                                        <span>${lvl}</span> <i class="fas fa-check-circle"></i>
                                    </div>
                                `).join('') 
                                : '<p style="color:#95a5a6; font-size:0.9em;">Пока нет полностью пройденных уровней. Вперед!</p>'
                            }
                        </div>
                    </div>
                </div>
            `;
        }
    },

    async initClassFilter() {
        try {
            const res = await fetch(`${API}/teacher/dashboard/${this.user.id}`);
            const classes = await res.json();
            const select = document.getElementById('class-filter');

            if (classes.length === 0) {
                select.innerHTML = '<option disabled>Нет классов</option>';
                return;
            }

            // Убираем "Все классы", сразу ставим первый класс
            let html = '';
            classes.forEach(c => {
                html += `<option value="${c.class_id}">${c.class_name}</option>`;
            });
            select.innerHTML = html;

            // Выбираем первый по умолчанию
            if (classes.length > 0) select.value = classes[0].class_id;

            this.loadTeacherAnalytics();
        } catch (e) { console.error(e); }
    },

    async loadTeacherAnalytics() {
        try {
            const classId = document.getElementById('class-filter').value;
            const resClasses = await fetch(`${API}/teacher/dashboard/${this.user.id}`);
            const classes = await resClasses.json();

            let filteredStudents = [];
            // Фильтруем студентов выбранного класса
            const target = classes.find(c => c.class_id == classId);
            filteredStudents = target ? target.students : [];

            filteredStudents.forEach(s => s.lessons_done = parseInt(s.lessons_done) || 0);

            const needAttention = filteredStudents.filter(s => s.lessons_done < 5).sort((a, b) => b.lessons_done - a.lessons_done);
            const middle = filteredStudents.filter(s => s.lessons_done >= 5 && s.lessons_done < 10).sort((a, b) => b.lessons_done - a.lessons_done);
            const topStudents = filteredStudents.filter(s => s.lessons_done >= 10).sort((a, b) => b.lessons_done - a.lessons_done);

            if (document.getElementById('count-attention')) document.getElementById('count-attention').innerText = needAttention.length;
            if (document.getElementById('count-mid')) document.getElementById('count-mid').innerText = middle.length;
            if (document.getElementById('count-top')) document.getElementById('count-top').innerText = topStudents.length;

            const renderRow = (s, colorClass, colorText) => `
                <div class="risk-item">
                    <span class="avatar-circle ${colorClass}" style="${colorClass === 'yellow' ? 'background:#f1c40f' : ''}">
                        ${s.avatar ? `<img src="${s.avatar}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">` : s.name[0]}
                    </span>
                    <div><b>${s.name}</b><div style="font-size:11px; color:${colorText}">${s.lessons_done} уроков</div></div>
                </div>`;

            const renderList = (list, id, colorClass, colorText) => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = list.length ? list.map(s => renderRow(s, colorClass, colorText)).join('') : `<div style="color:#ccc; padding:10px; font-size:13px">Пусто</div>`;
            };

            renderList(needAttention, 'attention-list', 'red', '#e74c3c');
            renderList(middle, 'mid-list', 'yellow', '#f39c12');
            renderList(topStudents, 'top-list', 'green', '#2ecc71');

            // --- ГРАФИК ---
            const resStats = await fetch(`${API}/teacher/stats/activity/${this.user.id}?classId=${classId}`);
            const rawData = await resStats.json();

            const toISODate = (d) => {
                if (typeof d === 'string') return d.substring(0, 10);
                const dateObj = new Date(d);
                return dateObj.toISOString().substring(0, 10);
            };

            const last7Days = [];
            for (let i = 6; i >= 0; i--) {
                const d = new Date();
                d.setDate(d.getDate() - i);
                last7Days.push(d);
            }

            const maxVal = Math.max(...rawData.map(d => d.count), 5);
            let barHTML = '', axisHTML = '';

            last7Days.forEach(dayObj => {
                const currentDayStr = toISODate(dayObj);
                const stat = rawData.find(d => toISODate(d.dateStr || d.date) === currentDayStr);
                const count = stat ? stat.count : 0;
                const height = Math.round((count / maxVal) * 100);
                const color = count > 0 ? '#3498db' : '#ecf0f1';
                const minH = count > 0 ? '4px' : '2px';

                barHTML += `<div class="bar" style="height: calc(${height}% + ${minH}); background:${color}" title="${currentDayStr}: ${count}"></div>`;
                axisHTML += `<span>${dayObj.toLocaleDateString(this.interfaceLang, { weekday: 'short' })}</span>`;
            });

            if (document.getElementById('activity-chart')) document.getElementById('activity-chart').innerHTML = barHTML;
            if (document.getElementById('activity-axis')) document.getElementById('activity-axis').innerHTML = axisHTML;

            // --- КРУГОВАЯ ДИАГРАММА ---
            const total = filteredStudents.length || 1;
            const p1 = (needAttention.length / total) * 100;
            const p2 = (middle.length / total) * 100;
            if (document.getElementById('level-chart'))
                document.getElementById('level-chart').style.background = `conic-gradient(#e74c3c 0% ${p1}%, #f1c40f ${p1}% ${p1 + p2}%, #2ecc71 ${p1 + p2}% 100%)`;

            if (document.getElementById('level-legend'))
                document.getElementById('level-legend').innerHTML = `
                    <div><span style="background:#e74c3c"></span> Внимание</div>
                    <div><span style="background:#f1c40f"></span> Хорошисты</div>
                    <div><span style="background:#2ecc71"></span> Отличники</div>
                `;

        } catch (e) { console.error(e); }
    },

    // ============================================================
    // 4. УЧИТЕЛЬ: УПРАВЛЕНИЕ КЛАССАМИ
    // ============================================================
    async renderTeacherDashboard(container) {
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
                    <div class="class-card" id="card-class-${cls.class_id}">
                        <div class="class-header">
                            <div style="display:flex; align-items:center; gap:10px;">
                                <h3>${cls.class_name}</h3>
                                <button class="delete-btn" onclick="app.removeClass(${cls.class_id})" title="Удалить весь класс" style="font-size:1rem; margin:0;">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                            <span style="color:#7f8c8d">Учеников: ${cls.students.length}</span>
                        </div>
                        <div class="students-list">
                            ${cls.students.length === 0 ? '<p style="color:#ccc; font-style:italic">В этом классе пока нет учеников</p>' : ''}
                            ${cls.students.map(s => `
                                <div class="student-row">
                                    <div style="display:flex; align-items:center; gap:10px;">
                                        <img src="${s.avatar || `https://ui-avatars.com/api/?name=${s.name}&background=random`}" class="mini-avatar">
                                        <div class="st-info">
                                            <b>${s.name}</b> <small>(ID: ${s.user_id})</small><br>
                                            <small>Пройдено уроков: <b style="color:#2ecc71">${s.lessons_done}</b></small>
                                        </div>
                                    </div>
                                    <button class="delete-btn" onclick="app.removeStudent(${cls.class_id}, ${s.user_id}, this)" title="Исключить">
                                        <i class="fas fa-user-minus"></i>
                                    </button>
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
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ teacherId: this.user.id, name })
        });
        this.tab('dashboard');
    },

    async addStudent(classId) {
         // 1. Находим поле ввода
        const input = document.getElementById(`add-st-${classId}`);
        
        // 2. Превращаем строку в число (Важно!)
        const studentId = parseInt(input.value);

        if (!studentId) {
            alert("Пожалуйста, введите корректный ID ученика (число).");
            return;
        }

        const btn = document.querySelector(`#card-class-${classId} .add-student-form button`);
        const oldIcon = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; // Показываем загрузку

        try {
            const res = await fetch(`${API}/teacher/add-student`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                // Отправляем studentId именно как число
                body: JSON.stringify({ classId, studentId }) 
            });

            // 3. Проверяем, не вернул ли сервер ошибку (HTML вместо JSON)
            const contentType = res.headers.get("content-type");
            if (!contentType || !contentType.includes("application/json")) {
                throw new Error("Сервер вернул ошибку (не JSON). Проверьте логи Vercel.");
            }

            const data = await res.json();

            if (data.error) {
                alert("Ошибка: " + data.error);
            } else {
                // Успех! Обновляем дашборд
                this.tab('dashboard');
            }
        } catch (e) {
            console.error(e);
            alert('Не удалось добавить ученика. Проверьте консоль браузера (F12).');
        } finally {
            // Возвращаем кнопку в исходное состояние
            btn.disabled = false;
            btn.innerHTML = oldIcon;
        }
    },

    async removeStudent(classId, studentId, btnElement) {
        if (!confirm('Исключить ученика из этого класса?')) return;
        const row = btnElement.closest('.student-row');
        row.style.opacity = '0.5';

        try {
            const res = await fetch(`${API}/teacher/remove-student`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ classId, studentId })
            });
            const data = await res.json();
            if (data.error) {
                alert(data.error); row.style.opacity = '1';
            } else {
                row.remove();
            }
        } catch (e) { console.error(e); row.style.opacity = '1'; }
    },

    async removeClass(classId) {
        if (!confirm('Вы уверены? Весь класс будет удален!')) return;
        const card = document.getElementById(`card-class-${classId}`);
        card.style.opacity = '0.5';

        try {
            const res = await fetch(`${API}/teacher/remove-class`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ classId })
            });
            const data = await res.json();
            if (data.error) {
                alert(data.error); card.style.opacity = '1';
            } else {
                card.remove();
            }
        } catch (e) { console.error(e); }
    },

    // --- АВАТАРКИ ---
    avatarsCollection: [
        'https://cdn-icons-png.flaticon.com/512/616/616430.png', 'https://cdn-icons-png.flaticon.com/512/616/616408.png',
        'https://cdn-icons-png.flaticon.com/512/616/616440.png', 'https://cdn-icons-png.flaticon.com/512/616/616458.png',
        'https://cdn-icons-png.flaticon.com/512/616/616460.png', 'https://cdn-icons-png.flaticon.com/512/616/616492.png',
        'https://cdn-icons-png.flaticon.com/512/616/616554.png', 'https://cdn-icons-png.flaticon.com/512/616/616409.png',
        'https://cdn-icons-png.flaticon.com/512/616/616569.png', 'https://cdn-icons-png.flaticon.com/512/616/616494.png',
        'https://cdn-icons-png.flaticon.com/512/616/616489.png', 'https://cdn-icons-png.flaticon.com/512/616/616566.png',
        'https://cdn-icons-png.flaticon.com/512/616/616470.png', 'https://cdn-icons-png.flaticon.com/512/616/616538.png',
        'https://cdn-icons-png.flaticon.com/512/616/616515.png', 'https://cdn-icons-png.flaticon.com/512/2922/2922510.png',
        'https://cdn-icons-png.flaticon.com/512/2922/2922561.png', 'https://cdn-icons-png.flaticon.com/512/2922/2922522.png',
        'https://cdn-icons-png.flaticon.com/512/2922/2922579.png', 'https://cdn-icons-png.flaticon.com/512/2922/2922506.png',
        'https://cdn-icons-png.flaticon.com/512/2922/2922566.png', 'https://cdn-icons-png.flaticon.com/512/2922/2922656.png',
        'https://cdn-icons-png.flaticon.com/512/2922/2922608.png', 'https://cdn-icons-png.flaticon.com/512/4322/4322991.png',
        'https://cdn-icons-png.flaticon.com/512/4712/4712109.png'
    ],

    openAvatarSelector() {
        const modal = document.getElementById('avatar-modal');
        const grid = document.getElementById('avatar-grid');
        grid.innerHTML = this.avatarsCollection.map(src => `<img src="${src}" class="avatar-option" onclick="app.setAvatar('${src}')">`).join('');
        modal.classList.add('active');
    },

    async setAvatar(url) {
        try {
            const res = await fetch(`${API}/user/avatar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ userId: this.user.id, avatarUrl: url }) });
            if ((await res.json()).success) {
                this.user.avatar = url;
                localStorage.setItem('user', JSON.stringify(this.user));
                this.updateSidebarAvatar();
                document.getElementById('avatar-modal').classList.remove('active');
            }
        } catch (e) { alert('Ошибка'); }
    },

    updateSidebarAvatar() {
        const img = document.getElementById('sidebar-avatar');
        const currentAvatar = this.user.avatar || this.avatarsCollection[0];
        if (img) img.src = currentAvatar;
    },

    // ============================================================
    // 5. УРОКИ И ИГРЫ
    // ============================================================
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

    restoreProgress() {
        for (const [taskId, ans] of Object.entries(this.userAnswers)) {
            const card = document.getElementById(`card-${taskId}`);
            if (!card) continue;

            // Если это текст
            const input = document.getElementById(`input_${taskId}`);
            if (input) {
                input.value = ans;
                input.disabled = true;
                const btn = card.querySelector('button');
                if (btn) { btn.innerText = 'Принято'; btn.disabled = true; }
            }
            // Если это тест
            else {
                const radios = card.querySelectorAll('input[type="radio"]');
                radios.forEach(r => {
                    const label = r.closest('label');
                    const txt = label.querySelector('span').innerText.trim();
                    if (txt == ans) {
                        r.checked = true;
                        label.classList.add('selected');
                    }
                });
            }
            // Блокируем карту, так как ответ уже есть
            card.classList.add('locked');
        }
    },

async loadLesson(id) {
        const res = await fetch(`${API}/lessons/${id}?userId=${this.user.id}`);
        const data = await res.json();
        
        this.currentLessonId = data.lesson.lesson_id;
        this.currentTasks = data.tasks || [];
        
        // Достаем черновик
        const savedData = localStorage.getItem(`lesson_${this.user.id}_${this.currentLessonId}`);
        this.userAnswers = savedData ? JSON.parse(savedData) : {};

        const t = this.translations[this.interfaceLang];
        let videoHTML = data.lesson.video_url ? `<div class="video-container"><iframe src="${data.lesson.video_url}" frameborder="0" allowfullscreen></iframe></div>` : '';

        document.getElementById('content-area').innerHTML = `
            <button onclick="app.tab('lessons')" class="back-btn">← Назад</button>
            <div class="lesson-header"><h1>${data.lesson.title_ru}</h1></div>
            <div class="theory-box">${data.lesson.theory_content}</div>
            ${videoHTML} 
            <div class="practice-section">
                <h2>Практика</h2>
                <div id="tasks-wrapper">${this.currentTasks.map((task, index) => this.renderTaskHTML(task, index)).join('')}</div>
                
                <div id="finish-btn-container" style="margin-top:30px;">
                    <button id="finish-lesson-btn" class="primary-btn" onclick="app.finishLesson()">Завершить урок</button>
                </div>

                <div id="lesson-footer" class="lesson-footer" style="display:none;">
                    <div class="result-info">
                        <span class="result-score" id="res-score-text"></span>
                        <span class="result-timer" id="res-timer"></span>
                    </div>
                    <div class="scale-bg"><div class="scale-fill" id="res-scale" style="width:0%"></div></div>
                    <p id="res-msg" style="margin-top:10px; color:#7f8c8d"></p>
                </div>
            </div>`;
        
        document.querySelector('.main-content').scrollTop = 0;

        // 1. СНАЧАЛА восстанавливаем ответы (чтобы было видно, что решали)
        this.restoreProgress();

        // 2. ПОТОМ проверяем, сдан ли урок
        if (data.progress) {
            const lastRun = new Date(data.progress.completed_at);
            const now = new Date();
            const diffMins = Math.floor((now - lastRun) / 60000);

            // Если час еще не прошел — ПОКАЗЫВАЕМ РЕЗУЛЬТАТ
            if (diffMins < 60) {
                const total = this.currentTasks.length;
                const score = data.progress.score;
                const percent = total > 0 ? Math.round((score / total) * 100) : 0;

                const footer = document.getElementById('lesson-footer');
                footer.style.display = 'block';
                setTimeout(() => { document.getElementById('res-scale').style.width = `${percent}%`; }, 100);
                
                document.getElementById('res-score-text').innerText = `Результат: ${score} из ${total}`;
                document.getElementById('res-msg').innerText = "Урок пройден. Результат загружен.";
                
                this.startCooldownTimer(60 - diffMins);
                document.getElementById('finish-btn-container').style.display = 'none';
                
                // Блокируем всё намертво
                this.lockAllInputs();
            }
        }
    },

    async toggleLessonStatus(id, btnElement) {
        const t = this.translations[this.interfaceLang];
        const isCompleted = this.completedLessons.includes(id);
        const method = isCompleted ? 'DELETE' : 'POST';
        try {
            await fetch(`${API}/progress`, {
                method: method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: this.user.id, lessonId: id })
            });
            if (isCompleted) {
                this.completedLessons = this.completedLessons.filter(lessonId => lessonId !== id);
                btnElement.classList.remove('done');
                btnElement.innerText = t.statusNotDone;
            } else {
                this.completedLessons.push(id);
                btnElement.classList.add('done');
                btnElement.innerText = t.statusDone;
            }
        } catch (e) { alert("Ошибка сохранения прогресса"); }
    },

// --- 2. ОТРИСОВКА ЗАДАНИЙ (ИСПРАВЛЕНА ОШИБКА .split) ---
    renderTaskHTML(task, index) {
        let content = '';
        
        if (task.task_type === 'multiple-choice') {
            let options = [];

            // ШАГ 1: Проверяем, может это уже массив?
            if (Array.isArray(task.options_json)) {
                options = task.options_json;
            }
            // ШАГ 2: Если это строка, пробуем прочитать
            else if (typeof task.options_json === 'string') {
                try {
                    // Пробуем как JSON
                    const parsed = JSON.parse(task.options_json);
                    if (Array.isArray(parsed)) options = parsed;
                    else options = [String(parsed)]; // Если вдруг там просто число
                } catch (e) {
                    // Если не JSON, значит просто текст через запятую
                    options = task.options_json.split(',').map(s => s.trim());
                }
            }
            // ШАГ 3: Защита от пустых значений
            else {
                options = [];
            }

            content = `<div class="options-group">${options.map(opt => `
                <label class="task-option" onclick="app.checkAnswer(this, '${opt}', ${task.task_id})">
                    <input type="radio" name="task_${task.task_id}">
                    <span>${opt}</span>
                </label>`).join('')}</div>`;
        } else {
            // Текстовый ввод
            content = `<div class="input-group">
                <input type="text" class="task-input" id="input_${task.task_id}" placeholder="Ваш ответ...">
                <button class="primary-btn" style="width:auto; margin:0 0 0 10px;" onclick="app.checkInput(${task.task_id})">OK</button>
            </div>`;
        }
        
        return `<div class="task-card" id="card-${task.task_id}"><p><b>${index + 1}.</b> ${task.question_text}</p>${content}</div>`;
    },


async finishLesson() {
        const btn = document.getElementById('finish-lesson-btn');

        // --- 1. ПРОВЕРКА: ВСЕ ЛИ ЗАПОЛНЕНО? ---
        const answeredIds = Object.keys(this.userAnswers);
        const validAnswers = answeredIds.filter(id => this.userAnswers[id] && this.userAnswers[id].trim() !== '');
        
        if (validAnswers.length < this.currentTasks.length) {
            alert(`⚠️ Вы ответили на ${validAnswers.length} из ${this.currentTasks.length} вопросов.\nЗаполните все задания, чтобы завершить урок!`);
            return;
        }

        btn.disabled = true; btn.innerText = 'Проверка...';

        // --- 2. ПОДСЧЕТ БАЛЛОВ (С ИГНОРИРОВАНИЕМ ЗНАКОВ) ---
        let score = 0;
        this.currentTasks.forEach(task => {
            // Получаем текст ответов и приводим к нижнему регистру
            let userAns = (this.userAnswers[task.task_id] || '').toLowerCase();
            let correctAns = (task.correct_answer || '').toLowerCase();

            // !!! ГЛАВНОЕ ИЗМЕНЕНИЕ !!!
            // Удаляем знаки вопроса (?), точки (.) и восклицательные знаки (!)
            userAns = userAns.replace(/[?.!]/g, '').trim();
            correctAns = correctAns.replace(/[?.!]/g, '').trim();

            if (userAns === correctAns) score++;
        });

        const total = this.currentTasks.length;
        const percent = total > 0 ? Math.round((score / total) * 100) : 0;

        try {
            const res = await fetch(`${API}/progress`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: this.user.id, lessonId: this.currentLessonId, score: score })
            });
            const data = await res.json();

            // Показываем панель внизу
            const footer = document.getElementById('lesson-footer');
            footer.style.display = 'block';
            setTimeout(() => { document.getElementById('res-scale').style.width = `${percent}%`; }, 100);

            const scoreText = document.getElementById('res-score-text');
            const msgText = document.getElementById('res-msg');

            scoreText.innerText = `Результат: ${score} из ${total}`;

            if (data.success) {
                msgText.innerText = `🎉 Отлично! Результат сохранен.`;
                msgText.style.color = '#27ae60';
                localStorage.removeItem(`lesson_${this.user.id}_${this.currentLessonId}`);
                
                if (!this.completedLessons.includes(this.currentLessonId)) {
                    this.completedLessons.push(this.currentLessonId);
                }
                this.startCooldownTimer(60); 
            } else {
                msgText.innerText = `⚠️ ${data.error}`;
                msgText.style.color = '#e74c3c';
                const match = data.error.match(/(\d+)/); 
                const mins = match ? parseInt(match[0]) : 60;
                this.startCooldownTimer(mins);
            }
            
            document.getElementById('finish-btn-container').style.display = 'none';
            this.lockAllInputs();

        } catch (e) {
            console.error(e);
            alert('Ошибка соединения');
            btn.disabled = false; btn.innerText = 'Завершить урок';
        }
    },

    // ВЫБОР В ТЕСТЕ
    checkAnswer(label, selected, taskId) {
        const card = label.closest('.task-card');
        if (card.classList.contains('locked')) return; // Если уже решал - выход

        // Сохраняем ответ
        this.userAnswers[taskId] = selected;
        localStorage.setItem(`lesson_${this.user.id}_${this.currentLessonId}`, JSON.stringify(this.userAnswers));

        // Визуально выбираем (просто синий цвет)
        label.querySelector('input').checked = true;
        label.classList.add('selected');

        // Блокируем задание
        card.classList.add('locked');
    },

    // ВВОД СЛОВА
    checkInput(taskId) {
        const input = document.getElementById(`input_${taskId}`);
        const val = input.value.trim();
        if (!val) return;

        const card = input.closest('.task-card');
        if (card.classList.contains('locked')) return;

        // Сохраняем
        this.userAnswers[taskId] = val;
        localStorage.setItem(`lesson_${this.user.id}_${this.currentLessonId}`, JSON.stringify(this.userAnswers));

        // Блокируем
        card.classList.add('locked');
        input.disabled = true;
        const btn = card.querySelector('button');
        if (btn) { btn.innerText = 'Принято'; btn.disabled = true; }
    },

    // ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ
    saveAnswer(taskId, answer) {
        this.userAnswers[taskId] = answer;
        // Сохраняем в браузер, чтобы не пропало при F5
        localStorage.setItem(`lesson_${this.user.id}_${this.currentLessonId}`, JSON.stringify(this.userAnswers));
    },

    lockTaskUI(taskId) {
        // Находим карточку задания
        let element = document.getElementById(`input_${taskId}`);
        if (!element) element = document.getElementsByName(`task_${taskId}`)[0];

        if (element) {
            const card = element.closest('.task-card');
            card.classList.add('locked'); // CSS сделает его полупрозрачным и некликабельным

            // Если это текстовое поле - дизейблим кнопку
            const btn = card.querySelector('button');
            if (btn) { btn.disabled = true; btn.innerText = 'Принято'; }
        }
    },

    lockAllInputs() {
        // Блокируем карточки
        document.querySelectorAll('.task-card').forEach(c => c.classList.add('locked'));
        // Блокируем инпуты и кнопки
        document.querySelectorAll('input, button.primary-btn').forEach(el => el.disabled = true);
        // Возвращаем кнопку "Назад" к жизни, а то она тоже заблокируется
        document.querySelector('.back-btn').disabled = false;
    },

    startCooldownTimer(minutes) {
        const timerBox = document.getElementById('res-timer');
        if (!timerBox) return;
        timerBox.style.display = 'inline-block';
        
        let seconds = Math.floor(minutes * 60);
        if (this.timerInterval) clearInterval(this.timerInterval);

        this.timerInterval = setInterval(() => {
            seconds--;
            if (seconds < 0) {
                clearInterval(this.timerInterval);
                timerBox.innerText = "✅ Можно пересдать!";
                return;
            }
            const m = Math.floor(seconds / 60).toString().padStart(2, '0');
            const s = (seconds % 60).toString().padStart(2, '0');
            timerBox.innerText = `⏳ Пересдача через: ${m}:${s}`;
        }, 1000);
    },

    async renderDictionary(container) {
        container.innerHTML = `
            <div style="margin-bottom: 20px;">
                <h1>📖 Словарь</h1>
                <div style="display:flex; gap:10px; flex-wrap:wrap;">
                    <input type="text" id="dict-search" class="form-control" placeholder="Поиск слова..." style="flex-grow:1; padding:10px; border:1px solid #ccc; border-radius:5px;">
                    <select id="dict-level-filter" style="padding:10px; border:1px solid #ccc; border-radius:5px; min-width:120px;">
                        <option value="ALL">Все уровни</option>
                        <option value="A1">A1</option>
                        <option value="A2">A2</option>
                        <option value="B1">B1</option>
                        <option value="B2">B2</option>
                        <option value="C1">C1</option>
                    </select>
                </div>
            </div>
            <div id="words-grid" class="words-grid">Загрузка...</div>
        `;

        const res = await fetch(`${API}/words?lang=en`);
        const words = await res.json();

        const draw = () => {
            const query = document.getElementById('dict-search').value.toLowerCase();
            const level = document.getElementById('dict-level-filter').value;

            const list = words.filter(w => {
                const matchSearch = w.word.toLowerCase().includes(query) || w.translation_ru.toLowerCase().includes(query);
                const matchLevel = level === 'ALL' || w.level_code === level;
                return matchSearch && matchLevel;
            });

            if (list.length === 0) {
                document.getElementById('words-grid').innerHTML = '<p style="color:#777">Ничего не найдено</p>';
                return;
            }

            document.getElementById('words-grid').innerHTML = list.map(w => `
                <div class="word-card" style="display:flex; justify-content:space-between; align-items:center; padding:15px; background:white; margin-bottom:10px; border-radius:8px; box-shadow:0 2px 5px rgba(0,0,0,0.05);">
                    <div>
                        <b style="font-size:1.1em; color:#2c3e50;">${w.word}</b> 
                        <span style="font-size:0.8em; background:#eee; padding:2px 6px; border-radius:4px; color:#555;">${w.level_code || 'A1'}</span>
                        <div style="color:#7f8c8d; font-size:0.9em; margin-top:2px;">${w.translation_ru}</div>
                    </div>
                    <button onclick="app.speak('${w.word}')" style="border:none; background:#ecf0f1; width:45px; height:45px; border-radius:50%; cursor:pointer; font-size:1.5rem; transition:0.2s;" title="Прослушать">🔊</button>
                </div>
            `).join('');
        };
        draw();

        document.getElementById('dict-search').oninput = draw;
        document.getElementById('dict-level-filter').onchange = draw;
    },

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
        } catch (e) { console.error(e); }
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
            while (distractors.length < 3) {
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
                <div class="timer-bar"><div class="timer-fill" style="width: ${(timeLeft / 60) * 100}%"></div></div>
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
                if (bar) bar.style.width = `${(timeLeft / 60) * 100}%`;
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
                    return `<button class="wb-letter-btn ${used ? 'used' : ''}" data-char="${char}">${char}</button>`;
                }).join('')}</div>
                    <button class="back-btn" id="reset-btn" style="margin-top:20px; color:orange">Сброс</button>
                `;
                document.getElementById('quit-btn').onclick = () => this.quitGame();
                document.getElementById('reset-btn').onclick = () => { guess = []; render(); };

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
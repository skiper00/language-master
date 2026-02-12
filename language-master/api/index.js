const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('../db');
const crypto = require('crypto');
const jwt = require('jsonwebtoken'); // Используем правильную библиотеку
const fileUpload = require('express-fileupload');
const fs = require('fs');

const app = express();
const SECRET = 'super-secret-key-change-it-in-production';

app.use(cors());
app.use(express.json());
app.use(fileUpload());

// На Vercel папки uploads нет, раздаем статику только если папка существует
if (!process.env.VERCEL) {
    app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
}
app.use(express.static(path.join(__dirname, '../public')));

// === ИСПРАВЛЕНИЕ: Создаем папку uploads ТОЛЬКО на локальном компьютере ===
// Vercel запрещает создание папок, поэтому мы пропускаем этот шаг в облаке
if (!process.env.VERCEL) {
    const uploadDir = path.join(__dirname, '../uploads');
    if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir);
    }
}

// === ХЕЛПЕРЫ ДЛЯ ПАРОЛЕЙ ===
function hashPassword(password) {
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
    const [salt, hash] = stored.split(':');
    const verifyHash = crypto.scryptSync(password, salt, 64).toString('hex');
    return hash === verifyHash;
}

// Функция проверки и выдачи достижений
async function checkAchievements(userId) {
    const newBadges = [];

    // 1. Получаем статистику пользователя
    const [stats] = await pool.execute(`
        SELECT 
            (SELECT COUNT(*) FROM user_progress WHERE user_id = ?) as lessons,
            streak
        FROM users WHERE user_id = ?
    `, [userId, userId]);
    
    const userStats = stats[0];

    // 2. Список условий (ID награды -> Условие)
    const rules = [
        { id: 1, condition: userStats.lessons >= 1 }, // Первые шаги
        { id: 2, condition: userStats.lessons >= 5 }, // Студент
        { id: 3, condition: userStats.streak >= 3 }   // В огне
    ];

    for (let rule of rules) {
        if (rule.condition) {
            // Пробуем выдать (INSERT IGNORE проигнорирует, если уже есть)
            const [res] = await pool.execute(
                'INSERT IGNORE INTO user_achievements (user_id, ach_id) VALUES (?, ?)',
                [userId, rule.id]
            );
            // Если награда была добавлена только что (affectedRows > 0)
            if (res.affectedRows > 0) {
                // Начисляем XP за награду
                await pool.execute(`
                    UPDATE users u 
                    JOIN achievements a ON a.ach_id = ?
                    SET u.xp_points = u.xp_points + a.xp_reward 
                    WHERE u.user_id = ?
                `, [rule.id, userId]);
                newBadges.push(rule.id);
            }
        }
    }
    return newBadges;
}

// ==========================================
// МАРШРУТЫ API
// ==========================================

app.get('/api', (req, res) => {
    res.json({ status: 'Server is running on Vercel!' });
});


// НОВЫЙ МАРШРУТ: Реальная статистика активности за 7 дней
// ОБНОВЛЕННЫЙ МАРШРУТ (С форматированием даты)
// 1. ОБНОВЛЕННЫЙ МАРШРУТ АКТИВНОСТИ (С ФИЛЬТРОМ ПО КЛАССУ)
app.get('/api/teacher/stats/activity/:teacherId', async (req, res) => {
    try {
        const teacherId = req.params.teacherId;
        const classId = req.query.classId; // Получаем ID класса из параметров ?classId=...

        let sql = `
            SELECT DATE_FORMAT(up.completed_at, '%Y-%m-%d') as dateStr, COUNT(*) as count
            FROM user_progress up
            JOIN class_members cm ON up.user_id = cm.student_id
            JOIN classes c ON cm.class_id = c.class_id
            WHERE c.teacher_id = ? 
            AND up.completed_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)
        `;
        
        const params = [teacherId];

        // Если выбран конкретный класс, добавляем фильтр
        if (classId && classId !== 'ALL') {
            sql += ` AND cm.class_id = ?`;
            params.push(classId);
        }

        sql += ` GROUP BY dateStr ORDER BY dateStr ASC`;

        const [rows] = await pool.execute(sql, params);
        res.json(rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/teacher/remove-student', async (req, res) => {
    try {
        const { classId, studentId } = req.body;
        await pool.execute(
            'DELETE FROM class_members WHERE class_id = ? AND student_id = ?', 
            [classId, studentId]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. НОВЫЙ МАРШРУТ: ДЕТАЛИ УЧЕНИКА
app.get('/api/teacher/student-details/:studentId', async (req, res) => {
    try {
        const studentId = req.params.studentId;

        // Данные ученика + Стрик
        const [users] = await pool.execute('SELECT name, email, avatar, streak, created_at FROM users WHERE user_id = ?', [studentId]);
        if (!users.length) return res.status(404).json({ error: 'User not found' });
        
        // Список пройденных уроков (последние 10)
        const [history] = await pool.execute(`
            SELECT l.title_ru, DATE_FORMAT(up.completed_at, '%d.%m.%Y %H:%i') as date
            FROM user_progress up
            JOIN lessons l ON up.lesson_id = l.lesson_id
            WHERE up.user_id = ?
            ORDER BY up.completed_at DESC
            LIMIT 10
        `, [studentId]);

        res.json({ user: users[0], history });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Регистрация
app.post('/api/auth/register', async (req, res) => {
    const { name, email, password, role } = req.body;
    try {
        const hash = hashPassword(password);
        const userRole = role === 'teacher' ? 'teacher' : 'student';

        await pool.execute(
            'INSERT INTO users (name, email, password_hash, role) VALUES (?, ?, ?, ?)',
            [name, email, hash, userRole]
        );
        res.json({ success: true });
    } catch (err) {
        res.status(400).json({ error: 'Ошибка регистрации или Email занят' });
    }
});

app.post('/api/teacher/remove-class', async (req, res) => {
    try {
        const { classId } = req.body;
        // Сначала удаляем связи учеников с классом
        await pool.execute('DELETE FROM class_members WHERE class_id = ?', [classId]);
        // Потом удаляем сам класс
        await pool.execute('DELETE FROM classes WHERE class_id = ?', [classId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Вход
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [users] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
        if (!users.length || !verifyPassword(password, users[0].password_hash)) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        const user = users[0];

        const token = jwt.sign(
            { id: user.user_id, role: user.role },
            SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: { id: user.user_id, name: user.name, role: user.role, avatar: user.avatar }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});



// Получить статистику по классам
app.get('/api/teacher/dashboard/:id', async (req, res) => {
    try {
        // Используем маленькие буквы для таблиц (classes, users, class_members)
        const [classes] = await pool.execute('SELECT * FROM classes WHERE teacher_id = ?', [req.params.id]);

        for (let cls of classes) {
            const [students] = await pool.execute(`
                SELECT u.user_id, u.name, u.avatar,
                (SELECT COUNT(*) FROM user_progress up WHERE up.user_id = u.user_id) as lessons_done
                FROM users u
                JOIN class_members cm ON u.user_id = cm.student_id
                WHERE cm.class_id = ?
            `, [cls.class_id]);
            cls.students = students;
        }
        res.json(classes);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Создать класс
app.post('/api/teacher/classes', async (req, res) => {
    try {
        await pool.execute('INSERT INTO classes (teacher_id, class_name) VALUES (?, ?)', [req.body.teacherId, req.body.name]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// Добавить ученика
// === БРОНЕБОЙНЫЙ МАРШРУТ ADD-STUDENT ===
app.post('/api/teacher/add-student', async (req, res) => {
    // 1. ЛОГИРОВАНИЕ: Смотрим в Logs Vercel, что реально пришло
    console.log('➡️ [API] Add Student Request:', req.body);

    try {
        // 2. ЖЕСТКАЯ КОНВЕРТАЦИЯ: Защита от undefined и строк
        // Если придет null/undefined, станет NaN, и мы это поймаем
        const classId = parseInt(req.body.classId, 10);
        const studentId = parseInt(req.body.studentId, 10);

        // Проверка на валидность чисел
        if (isNaN(classId) || isNaN(studentId)) {
            console.error('❌ [API] Ошибка данных: ID не являются числами', { classId, studentId });
            return res.status(400).json({ error: 'Некорректные данные: ID должны быть числами!' });
        }

        // 3. ПРОВЕРКА УЧЕНИКА
        const [st] = await pool.execute(
            'SELECT user_id FROM users WHERE user_id = ? AND role = "student"', 
            [studentId]
        );
        
        if (!st.length) {
            console.error(`❌ [API] Ученик ${studentId} не найден`);
            return res.status(404).json({ error: 'Ученик не найден в базе данных' });
        }

        // 4. ДОБАВЛЕНИЕ (Используем явные имена колонок)
        // INSERT IGNORE спасет, если ученик уже добавлен
        const [result] = await pool.execute(
            'INSERT IGNORE INTO class_members (class_id, student_id) VALUES (?, ?)', 
            [classId, studentId]
        );

        console.log('✅ [API] Успешно добавлено/обновлено:', result);
        res.json({ success: true });

    } catch (err) {
        // 5. ВОЗВРАТ РЕАЛЬНОЙ ОШИБКИ
        // Это покажет тебе в alert() точный текст проблемы (например "Table doesn't exist")
        console.error('🔥 [API] CRITICAL DB ERROR:', err);
        res.status(500).json({ error: 'DB Error: ' + err.message });
    }
});


app.get('/api/word-of-day', async (req, res) => {
    try {
        // 1. Получаем список всех ID слов (это быстрый запрос)
        const [ids] = await pool.execute('SELECT word_id FROM words');
        
        if (ids.length === 0) return res.json(null);

        // 2. Генерируем "зерно" (Seed) на основе текущей даты
        // Например, 12 февраля 2026 превратится в число 20260212
        const now = new Date();
        const seed = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate();

        // 3. Выбираем индекс слова математически
        // Остаток от деления зерна на количество слов всегда даст одно и то же число сегодня
        // Умножаем seed на простое число (напр. 997), чтобы перемешать порядок, иначе слова пойдут просто по алфавиту/ID
        const index = (seed * 997) % ids.length;
        const targetId = ids[index].word_id;

        // 4. Достаем это конкретное слово
        const [rows] = await pool.execute('SELECT * FROM words WHERE word_id = ?', [targetId]);
        
        res.json(rows[0] || null);

    } catch (err) { 
        console.error(err);
        res.status(500).json({ error: err.message }); 
    }
});

// УДАЛЕНИЕ АККАУНТА (С ПРОВЕРКОЙ ПАРОЛЯ)
app.delete('/api/user', async (req, res) => {
    const { userId, password } = req.body;

    try {
        // 1. Проверяем пароль перед удалением
        const [users] = await pool.execute('SELECT * FROM users WHERE user_id = ?', [userId]);
        if (!users.length) return res.status(404).json({ error: 'Пользователь не найден' });
        
        const user = users[0];
        if (!verifyPassword(password, user.password_hash)) {
            return res.status(403).json({ error: 'Неверный пароль!' });
        }

        // 2. Начинаем чистку данных (порядок важен!)
        
        // А) Удаляем прогресс и достижения
        await pool.execute('DELETE FROM user_progress WHERE user_id = ?', [userId]);
        await pool.execute('DELETE FROM user_achievements WHERE user_id = ?', [userId]);

        // Б) Если это УЧЕНИК — удаляем его из классов
        await pool.execute('DELETE FROM class_members WHERE student_id = ?', [userId]);

        // В) Если это УЧИТЕЛЬ — удаляем его классы и всех учеников ИЗ ЭТИХ классов
        if (user.role === 'teacher') {
            // Находим ID классов учителя
            const [classes] = await pool.execute('SELECT class_id FROM classes WHERE teacher_id = ?', [userId]);
            const classIds = classes.map(c => c.class_id);

            if (classIds.length > 0) {
                // Удаляем учеников из этих классов (связи)
                // Используем IN (...) динамически
                const placeholders = classIds.map(() => '?').join(',');
                await pool.execute(`DELETE FROM class_members WHERE class_id IN (${placeholders})`, classIds);
                
                // Удаляем сами классы
                await pool.execute('DELETE FROM classes WHERE teacher_id = ?', [userId]);
            }
        }

        // 3. Наконец, удаляем самого пользователя
        await pool.execute('DELETE FROM users WHERE user_id = ?', [userId]);

        res.json({ success: true });

    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Ошибка при удалении: ' + err.message });
    }
});

app.delete('/api/progress', async (req, res) => {
    try {
        await pool.execute('DELETE FROM user_progress WHERE user_id = ? AND lesson_id = ?', [req.body.userId, req.body.lessonId]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/progress/:userId', async (req, res) => {
    try {
        const [rows] = await pool.execute('SELECT lesson_id FROM user_progress WHERE user_id = ?', [req.params.userId]);
        res.json(rows.map(r => r.lesson_id));
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// УРОКИ (Исправлен регистр букв для Linux)
app.get('/api/lessons', async (req, res) => {
    const lang = req.query.lang || 'en';
    try {
        // ВАЖНО: lessons вместо Lessons
        const [rows] = await pool.execute(`
            SELECT lesson_id, level_code, title_ru, title_en, description_ru
            FROM lessons
            WHERE lang_code = ?
            ORDER BY level_code, lesson_id`, [lang]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ПОЛУЧИТЬ УРОК (+ ПРОГРЕСС, ЕСЛИ ЕСТЬ)
app.get('/api/lessons/:id', async (req, res) => {
    try {
        const lessonId = req.params.id;
        const userId = req.query.userId; // Получаем ID юзера из запроса

        // 1. Грузим урок
        const [lesson] = await pool.execute('SELECT * FROM lessons WHERE lesson_id = ?', [lessonId]);
        if (lesson.length === 0) return res.status(404).json({ error: 'Урок не найден' });

        // 2. Грузим задания
        const [tasks] = await pool.execute('SELECT * FROM lesson_tasks WHERE lesson_id = ?', [lessonId]);

        // 3. Грузим прогресс этого ученика (ОЦЕНКУ И ВРЕМЯ)
        let progress = null;
        if (userId) {
            const [progRows] = await pool.execute(
                'SELECT score, completed_at FROM user_progress WHERE user_id = ? AND lesson_id = ?', 
                [userId, lessonId]
            );
            if (progRows.length > 0) progress = progRows[0];
        }

        res.json({ lesson: lesson[0], tasks: tasks, progress: progress });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// СЛОВАРЬ (Исправлен регистр)
app.get('/api/words', async (req, res) => {
    const lang = req.query.lang || 'en';
    try {
        // ВАЖНО: words вместо Words
        const [rows] = await pool.execute('SELECT * FROM words WHERE lang_code = ? ORDER BY word', [lang]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ТЕСТЫ (Исправлен регистр)
app.get('/api/quiz-words', async (req, res) => {
    const lang = req.query.lang || 'en';
    try {
        // ВАЖНО: words вместо Words
        const [rows] = await pool.execute('SELECT * FROM words WHERE lang_code = ? ORDER BY RAND() LIMIT 5', [lang]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});
// СОХРАНЕНИЕ ПРОГРЕССА (С ПРОВЕРКОЙ ВРЕМЕНИ И ОЦЕНКИ)
app.post('/api/progress', async (req, res) => {
    const { userId, lessonId, score } = req.body;
    
    try {
        // 1. Проверяем, когда ученик проходил этот урок
        const [existing] = await pool.execute(
            'SELECT completed_at FROM user_progress WHERE user_id = ? AND lesson_id = ?',
            [userId, lessonId]
        );

        // 2. Если проходил, проверяем прошло ли 60 минут
        if (existing.length > 0) {
            const lastRun = new Date(existing[0].completed_at);
            const now = new Date();
            const diffMins = Math.floor((now - lastRun) / 60000);

            // Если прошло меньше 60 минут — ошибка
            if (diffMins < 60) {
                return res.json({ 
                    success: false, 
                    error: `Урок уже пройден. Исправить оценку можно через ${60 - diffMins} мин.` 
                });
            }
        }

        // 3. Сохраняем результат
        await pool.execute(`
            INSERT INTO user_progress (user_id, lesson_id, score, completed_at) 
            VALUES (?, ?, ?, NOW())
            ON DUPLICATE KEY UPDATE 
                score = VALUES(score), 
                completed_at = NOW()
        `, [userId, lessonId, score || 0]);
        
        // 4. Проверяем ачивки
        const newBadges = await checkAchievements(userId);

        res.json({ success: true, newBadges });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/user/achievements/:id', async (req, res) => {
    try {
        const [rows] = await pool.execute(`
            SELECT a.*, ua.earned_at 
            FROM achievements a
            JOIN user_achievements ua ON a.ach_id = ua.ach_id
            WHERE ua.user_id = ?
            ORDER BY ua.earned_at DESC
        `, [req.params.id]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/teacher/award', async (req, res) => {
    const { teacherId, studentId, achievementId } = req.body;
    try {
        // Проверка: учитель должен владеть классом этого ученика (упрощено для примера)
        await pool.execute(
            'INSERT IGNORE INTO user_achievements (user_id, ach_id) VALUES (?, ?)',
            [studentId, achievementId]
        );
        // Начисляем XP
        await pool.execute(`
            UPDATE users u 
            JOIN achievements a ON a.ach_id = ?
            SET u.xp_points = u.xp_points + a.xp_reward 
            WHERE u.user_id = ?
        `, [achievementId, studentId]);

        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/user/avatar', async (req, res) => {
    try {
        const { userId, avatarUrl } = req.body;
        await pool.execute('UPDATE users SET avatar = ? WHERE user_id = ?', [avatarUrl, userId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// --- 2. МАССОВАЯ РАЗДАЧА (ЗАПУСТИТЬ 1 РАЗ В БРАУЗЕРЕ) ---
app.get('/api/admin/fix-avatars', async (req, res) => {
    try {
        await pool.execute(`
            UPDATE users 
            SET avatar = ELT(FLOOR(1 + RAND() * 25),
                'https://cdn-icons-png.flaticon.com/512/616/616430.png',
                'https://cdn-icons-png.flaticon.com/512/616/616408.png',
                'https://cdn-icons-png.flaticon.com/512/616/616440.png',
                'https://cdn-icons-png.flaticon.com/512/616/616458.png',
                'https://cdn-icons-png.flaticon.com/512/616/616460.png',
                'https://cdn-icons-png.flaticon.com/512/616/616492.png',
                'https://cdn-icons-png.flaticon.com/512/616/616554.png',
                'https://cdn-icons-png.flaticon.com/512/616/616409.png',
                'https://cdn-icons-png.flaticon.com/512/616/616569.png',
                'https://cdn-icons-png.flaticon.com/512/616/616494.png',
                'https://cdn-icons-png.flaticon.com/512/616/616489.png',
                'https://cdn-icons-png.flaticon.com/512/616/616566.png',
                'https://cdn-icons-png.flaticon.com/512/616/616470.png',
                'https://cdn-icons-png.flaticon.com/512/616/616538.png',
                'https://cdn-icons-png.flaticon.com/512/616/616515.png',
                'https://cdn-icons-png.flaticon.com/512/2922/2922510.png',
                'https://cdn-icons-png.flaticon.com/512/2922/2922561.png',
                'https://cdn-icons-png.flaticon.com/512/2922/2922522.png',
                'https://cdn-icons-png.flaticon.com/512/2922/2922579.png',
                'https://cdn-icons-png.flaticon.com/512/2922/2922506.png',
                'https://cdn-icons-png.flaticon.com/512/2922/2922566.png',
                'https://cdn-icons-png.flaticon.com/512/2922/2922656.png',
                'https://cdn-icons-png.flaticon.com/512/2922/2922608.png',
                'https://cdn-icons-png.flaticon.com/512/4322/4322991.png',
                'https://cdn-icons-png.flaticon.com/512/4712/4712109.png'
            )
            WHERE avatar IS NULL OR avatar = ''
        `);
        res.send('✅ Аватарки выданы!');
    } catch (e) { res.status(500).send('Ошибка: ' + e.message); }
});

module.exports = app;

if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Сервер запущен локально: http://localhost:${PORT}`);
    });
}
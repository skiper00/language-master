const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('../db'); // Обратите внимание на две точки, так как мы теперь в папке api
const crypto = require('crypto');
const jose = require('jose');
const fileUpload = require('express-fileupload'); // Vercel не поддерживает сохранение файлов на диск
const fs = require('fs');

const app = express();
const SECRET = new TextEncoder().encode('super-secret-key-change-it-in-production');

app.use(cors());
app.use(express.json());

// В Vercel статика (public) раздается автоматически, эти строки здесь не нужны
// app.use(express.static...); 
app.use(fileUpload());

app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Создаем папку uploads, если её нет (чтобы не было ошибок локально)
const uploadDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
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

// ==========================================
// МАРШРУТЫ API
// ==========================================

// Тестовый маршрут, чтобы проверить работу
app.get('/api', (req, res) => {
    res.json({ status: 'Server is running on Vercel!' });
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

// Вход
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    try {
        const [users] = await pool.execute('SELECT * FROM users WHERE email = ?', [email]);
        if (!users.length || !verifyPassword(password, users[0].password_hash)) {
            return res.status(401).json({ error: 'Неверный email или пароль' });
        }

        const user = users[0];
        const token = await new jose.SignJWT({ id: user.user_id, role: user.role })
            .setProtectedHeader({ alg: 'HS256' })
            .setExpirationTime('24h')
            .sign(SECRET);

        res.json({ 
            token, 
            user: { id: user.user_id, name: user.name, role: user.role, avatar: user.avatar } 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Загрузка аватарки (ЗАГЛУШКА ДЛЯ VERCEL)
// Vercel Read-Only File System не дает сохранять файлы.
// Для реальной работы нужно подключать Cloudinary или AWS S3.
app.post('/api/upload-avatar', async (req, res) => {
    // Если мы на Vercel (в облаке), выдаем ошибку, так как там нельзя писать файлы
    if (process.env.VERCEL) {
        return res.status(400).json({ error: 'На Vercel загрузка файлов не работает (Read-only system)' });
    }

    // А вот локально этот код сработает:
    if (!req.files || !req.files.avatar) {
        return res.status(400).json({ error: 'Файл не найден' });
    }

    const userId = req.body.userId;
    const file = req.files.avatar;
    const ext = path.extname(file.name);
    const newName = `user_${userId}_${Date.now()}${ext}`;
    const uploadPath = path.join(__dirname, '../uploads', newName);

    file.mv(uploadPath, async (err) => {
        if (err) {
            console.error(err);
            return res.status(500).send(err);
        }
        const url = `/uploads/${newName}`;
        await pool.execute('UPDATE users SET avatar = ? WHERE user_id = ?', [url, userId]);
        res.json({ avatarUrl: url });
    });
});

// Получить статистику по классам
app.get('/api/teacher/dashboard/:id', async (req, res) => {
    try {
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
app.post('/api/teacher/add-student', async (req, res) => {
    try {
        const [st] = await pool.execute('SELECT * FROM users WHERE user_id = ? AND role = "student"', [req.body.studentId]);
        if (!st.length) return res.status(404).json({ error: 'Ученик с таким ID не найден' });

        await pool.execute('INSERT IGNORE INTO class_members (class_id, student_id) VALUES (?, ?)', [req.body.classId, req.body.studentId]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ПРОГРЕСС
app.post('/api/progress', async (req, res) => {
    try {
        await pool.execute('INSERT IGNORE INTO user_progress (user_id, lesson_id) VALUES (?, ?)', [req.body.userId, req.body.lessonId]);
        res.json({ success: true });
    } catch (err) { res.status(500).json({ error: err.message }); }
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

// УРОКИ
app.get('/api/lessons', async (req, res) => {
    const lang = req.query.lang || 'en';
    try {
        const [rows] = await pool.execute(`
            SELECT lesson_id, level_code, title_ru, title_en, description_ru 
            FROM Lessons 
            WHERE lang_code = ? 
            ORDER BY level_code, lesson_id`, [lang]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/lessons/:id', async (req, res) => {
    try {
        const [lesson] = await pool.execute('SELECT * FROM Lessons WHERE lesson_id = ?', [req.params.id]);
        if (lesson.length === 0) return res.status(404).json({ error: 'Урок не найден' });

        const [tasks] = await pool.execute('SELECT * FROM Lesson_Tasks WHERE lesson_id = ?', [req.params.id]);

        res.json({ lesson: lesson[0], tasks: tasks });
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// СЛОВАРЬ
app.get('/api/words', async (req, res) => {
    const lang = req.query.lang || 'en';
    try {
        const [rows] = await pool.execute('SELECT * FROM Words WHERE lang_code = ? ORDER BY word', [lang]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ТЕСТЫ
app.get('/api/quiz-words', async (req, res) => {
    const lang = req.query.lang || 'en';
    try {
        const [rows] = await pool.execute('SELECT * FROM Words WHERE lang_code = ? ORDER BY RAND() LIMIT 5', [lang]);
        res.json(rows);
    } catch (err) { res.status(500).json({ error: err.message }); }
});

// ВАЖНО: ДЛЯ VERCEL МЫ ЭКСПОРТИРУЕМ APP, А НЕ ЗАПУСКАЕМ ЕГО
module.exports = app;


if (require.main === module) {
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`🚀 Сервер запущен локально: http://localhost:${PORT}`);
    });
}
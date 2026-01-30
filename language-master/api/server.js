const express = require('express');
const cors = require('cors');
const path = require('path');
const pool = require('./db');
const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// 1. Получить список уроков (сгруппировано по уровням)
app.get('/api/lessons', async (req, res) => {
    const lang = req.query.lang || 'en';
    try {
        const [rows] = await pool.execute(`
            SELECT lesson_id, level_code, title_ru, title_en, description_ru 
            FROM Lessons 
            WHERE lang_code = ? 
            ORDER BY level_code, lesson_id`, [lang]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 2. Получить один урок + задания к нему
app.get('/api/lessons/:id', async (req, res) => {
    try {
        const [lesson] = await pool.execute('SELECT * FROM Lessons WHERE lesson_id = ?', [req.params.id]);
        if (lesson.length === 0) return res.status(404).json({ error: 'Урок не найден' });

        const [tasks] = await pool.execute('SELECT * FROM Lesson_Tasks WHERE lesson_id = ?', [req.params.id]);

        res.json({
            lesson: lesson[0],
            tasks: tasks // options_json сам преобразуется в JSON, если драйвер настроен, иначе распарсим на фронте
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 3. Словарь
app.get('/api/words', async (req, res) => {
    const lang = req.query.lang || 'en';
    try {
        const [rows] = await pool.execute('SELECT * FROM Words WHERE lang_code = ? ORDER BY word', [lang]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// 4. Тесты (Quiz) - случайные 5 слов для проверки
app.get('/api/quiz-words', async (req, res) => {
    const lang = req.query.lang || 'en';
    try {
        // Берем 5 случайных слов
        const [rows] = await pool.execute('SELECT * FROM Words WHERE lang_code = ? ORDER BY RAND() LIMIT 5', [lang]);
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Сервер запущен: http://localhost:${PORT}`);
});
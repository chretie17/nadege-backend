const db = require('../config/db');

// Get all forum topics
exports.getForumTopics = (req, res) => {
    const query = `
        SELECT 
            ft.*, 
            u.name as creator_name,
            COUNT(fp.id) as post_count,
            MAX(fp.created_at) as last_post_date
        FROM 
            forum_topics ft
        JOIN 
            users u ON ft.created_by = u.id
        LEFT JOIN 
            forum_posts fp ON ft.id = fp.topic_id
        WHERE 
            ft.status = 'active'
        GROUP BY 
            ft.id
        ORDER BY 
            last_post_date DESC
    `;
    
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
};

// Get a specific forum topic with its posts
exports.getForumTopic = (req, res) => {
    const { id } = req.params;
    
    const topicQuery = `
        SELECT 
            ft.*, 
            u.name as creator_name
        FROM 
            forum_topics ft
        JOIN 
            users u ON ft.created_by = u.id
        WHERE 
            ft.id = ?
    `;
    
    const postsQuery = `
    SELECT 
        fp.*,
        u.name as user_name,
        (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = fp.id AND pl.like_type = 'like') as likes,
        (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = fp.id AND pl.like_type = 'dislike') as dislikes
    FROM 
        forum_posts fp
    JOIN 
        users u ON fp.user_id = u.id
    WHERE 
        fp.topic_id = ?
    ORDER BY 
        fp.created_at ASC
`;
    
    db.query(topicQuery, [id], (err, topicResults) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (topicResults.length === 0) {
            return res.status(404).json({ error: 'Topic not found' });
        }
        
        const topic = topicResults[0];
        
        db.query(postsQuery, [id], (err, postsResults) => {
            if (err) return res.status(500).json({ error: err.message });
            
            res.json({
                ...topic,
                posts: postsResults
            });
        });
    });
};

// Create a new forum topic
exports.createForumTopic = (req, res) => {
    const { title, description, created_by } = req.body;
    
    if (!title || !created_by) {
        return res.status(400).json({ error: 'Title and user ID are required' });
    }
    
    const query = `
        INSERT INTO forum_topics (title, description, created_by)
        VALUES (?, ?, ?)
    `;
    
    db.query(query, [title, description || null, created_by], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        res.status(201).json({ 
            message: 'Forum topic created successfully',
            topic_id: result.insertId
        });
    });
};

// Add a post to a forum topic
exports.createForumPost = (req, res) => {
    const { topic_id, user_id, content } = req.body;
    
    if (!topic_id || !user_id || !content) {
        return res.status(400).json({ error: 'Topic ID, user ID, and content are required' });
    }
    
    const query = `
        INSERT INTO forum_posts (topic_id, user_id, content)
        VALUES (?, ?, ?)
    `;
    
    db.query(query, [topic_id, user_id, content], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        res.status(201).json({ 
            message: 'Post added successfully',
            post_id: result.insertId
        });
    });
};

// Get all success stories
exports.getSuccessStories = (req, res) => {
    const query = `
        SELECT 
            ss.*,
            CASE WHEN ss.is_anonymous THEN 'Anonymous' ELSE u.name END as author_name
        FROM 
            success_stories ss
        JOIN 
            users u ON ss.user_id = u.id
        WHERE 
            ss.is_approved = true
        ORDER BY 
            ss.created_at DESC
    `;
    
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
};

// Submit a success story
exports.submitSuccessStory = (req, res) => {
    const { user_id, title, content, is_anonymous } = req.body;
    
    if (!user_id || !title || !content) {
        return res.status(400).json({ error: 'User ID, title, and content are required' });
    }
    
    const query = `
        INSERT INTO success_stories (user_id, title, content, is_anonymous)
        VALUES (?, ?, ?, ?)
    `;
    
    db.query(query, [user_id, title, content, is_anonymous || false], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        res.status(201).json({ 
            message: 'Success story submitted successfully. It will be visible after approval.',
            story_id: result.insertId
        });
    });
};

// Approve a success story (admin only)
exports.approveSuccessStory = (req, res) => {
    const { id } = req.params;
    
    const query = `
        UPDATE success_stories
        SET is_approved = true
        WHERE id = ?
    `;
    
    db.query(query, [id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Story not found' });
        }
        
        res.json({ message: 'Success story approved' });
    });
};
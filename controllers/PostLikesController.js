const db = require('../config/db');

// Get likes/dislikes for a post
exports.getPostLikes = (req, res) => {
    const { post_id } = req.params;
    
    const query = `
        SELECT 
            like_type, 
            COUNT(*) as count
        FROM 
            post_likes
        WHERE 
            post_id = ?
        GROUP BY 
            like_type
    `;
    
    db.query(query, [post_id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        
        // Format the response
        const response = {
            likes: 0,
            dislikes: 0
        };
        
        results.forEach(row => {
            if (row.like_type === 'like') {
                response.likes = row.count;
            } else if (row.like_type === 'dislike') {
                response.dislikes = row.count;
            }
        });
        
        res.json(response);
    });
};

// Get a user's likes
exports.getUserLikes = (req, res) => {
    const { user_id } = req.params;
    
    const query = `
        SELECT 
            post_id, 
            like_type
        FROM 
            post_likes
        WHERE 
            user_id = ?
    `;
    
    db.query(query, [user_id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
};

// Add a like or dislike to a post
exports.addPostLike = (req, res) => {
    const { post_id, user_id, like_type } = req.body;
    
    if (!post_id || !user_id || !like_type) {
        return res.status(400).json({ error: 'Post ID, user ID, and like type are required' });
    }
    
    if (like_type !== 'like' && like_type !== 'dislike') {
        return res.status(400).json({ error: 'Like type must be either "like" or "dislike"' });
    }
    
    // Check if the user has already liked/disliked this post
    const checkQuery = `
        SELECT id FROM post_likes
        WHERE post_id = ? AND user_id = ?
    `;
    
    db.query(checkQuery, [post_id, user_id], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (results.length > 0) {
            return res.status(400).json({ error: 'You have already rated this post' });
        }
        
        // Insert the new like
        const insertQuery = `
            INSERT INTO post_likes (post_id, user_id, like_type)
            VALUES (?, ?, ?)
        `;
        
        db.query(insertQuery, [post_id, user_id, like_type], (err, result) => {
            if (err) return res.status(500).json({ error: err.message });
            
            res.status(201).json({ 
                message: `Post ${like_type === 'like' ? 'liked' : 'disliked'} successfully`,
                id: result.insertId
            });
        });
    });
};

// Remove a like or dislike from a post
exports.removePostLike = (req, res) => {
    const { post_id, user_id } = req.body;
    
    if (!post_id || !user_id) {
        return res.status(400).json({ error: 'Post ID and user ID are required' });
    }
    
    const query = `
        DELETE FROM post_likes
        WHERE post_id = ? AND user_id = ?
    `;
    
    db.query(query, [post_id, user_id], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        
        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Like not found' });
        }
        
        res.json({ message: 'Like removed successfully' });
    });
};